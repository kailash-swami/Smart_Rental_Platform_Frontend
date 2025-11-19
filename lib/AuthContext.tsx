// Authentication context and provider
'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { User as FirebaseUser, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut as firebaseSignOut, GoogleAuthProvider, signInWithPopup } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { User } from '@/types'
import { apiClient } from '@/lib/api'
import { disconnectSocket } from '@/lib/socket'
import { useRouter } from 'next/router'
import toast from 'react-hot-toast'

interface AuthContextType {
  user: User | null
  firebaseUser: FirebaseUser | null
  token: string | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, name: string, role?: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  // optional role override stored locally until backend confirms
  setLocalRole: (role: string | null) => void
  signOut: () => Promise<void>
  updateProfile: (data: Partial<User>) => Promise<User | null>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Exchange Firebase token for backend JWT and user data
  const exchangeToken = async (fbUser: FirebaseUser) => {
    try {
      const idToken = await fbUser.getIdToken()
      // If the user previously selected a preferred role (e.g. to choose a
      // profile when multiple profiles exist for the same email), include
      // it so the backend can return the correct profile.
      const headers: Record<string,string> = { Authorization: `Bearer ${idToken}` }
      try {
        const storedPref = typeof window !== 'undefined' ? localStorage.getItem('preferredRole') : null
        if (storedPref) headers['x-preferred-role'] = storedPref
      } catch (e) {}

      const response = await apiClient.post('/auth/session', {}, { headers })
      
      const { token: backendToken, user: userData } = response.data
      setToken(backendToken)

      // Always respect the backend's authoritative role. If a previously stored
      // local `preferredRole` disagrees with the backend, overwrite it so the
      // UI cannot pretend to be a different role than the server knows.
      let effectiveUser = userData
      if (typeof window !== 'undefined') {
        try {
          const storedPref = localStorage.getItem('preferredRole')
          if (storedPref && userData && userData.role && storedPref !== userData.role) {
            // Backend role wins — align stored preference
            localStorage.setItem('preferredRole', userData.role)
          } else if (!storedPref && userData && userData.role) {
            localStorage.setItem('preferredRole', userData.role)
          }

          // Store token in localStorage
          localStorage.setItem('authToken', backendToken)
        } catch (e) {
          // ignore localStorage failures
        }
      }

      setUser(effectiveUser)
    } catch (error: any) {
      console.error('Error exchanging token:', error)
      toast.error('Authentication failed')
      throw error
    }
  }

  // Listen to Firebase auth state changes
  useEffect(() => {
    if (!auth) {
      setLoading(false)
      return
    }

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser)
      
      if (fbUser) {
        try {
          await exchangeToken(fbUser)
        } catch (error) {
          // Handle error silently, already shown toast
        }
      } else {
        // ensure socket is disconnected before removing token
        try { disconnectSocket() } catch (e) {}
        setUser(null)
        setToken(null)
        if (typeof window !== 'undefined') {
          localStorage.removeItem('authToken')
        }
      }
      
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    try {
      setLoading(true)
      const userCredential = await signInWithEmailAndPassword(auth, email, password)
      await exchangeToken(userCredential.user)
      // Do NOT allow client-only role overrides on sign-in.
      // The backend is authoritative for role membership; UI will be aligned
      // to the server-provided role in `exchangeToken`.
      toast.success('Signed in successfully!')
    } catch (error: any) {
      toast.error(error.message || 'Sign in failed')
      throw error
    } finally {
      setLoading(false)
    }
  }

  const signUp = async (email: string, password: string, name: string, role?: string) => {
    try {
      setLoading(true)
      const userCredential = await createUserWithEmailAndPassword(auth, email, password)
      await exchangeToken(userCredential.user)
      // Persist selected role to backend if provided. Only update local
      // preference after the backend confirms so users cannot impersonate
      // a role they did not sign up for.
      if (role) {
        try {
          const backendToken = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null
          if (backendToken) {
            await apiClient.post('/auth/set-role', { role }, { headers: { Authorization: `Bearer ${backendToken}` } })
            // Refresh session to pick up the backend-assigned role and token
            await exchangeToken(userCredential.user)
          }
        } catch (err) {
          console.warn('Failed to persist role to backend during signup:', err)
        }
      }
      toast.success('Account created successfully!')
    } catch (error: any) {
      toast.error(error.message || 'Sign up failed')
      throw error
    } finally {
      setLoading(false)
    }
  }

  const signInWithGoogle = async () => {
    try {
      setLoading(true)
      const provider = new GoogleAuthProvider()
      const userCredential = await signInWithPopup(auth, provider)
      await exchangeToken(userCredential.user)
      // Role assignment must happen via backend set-role flow; do not
      // persist any client-only role selection here.
      toast.success('Signed in with Google!')
    } catch (error: any) {
      toast.error(error.message || 'Google sign in failed')
      throw error
    } finally {
      setLoading(false)
    }
  }

  const signOut = async () => {
    try {
      await firebaseSignOut(auth)
      // disconnect socket before clearing local token to avoid unauthenticated reconnects
      try { disconnectSocket() } catch (e) {}
      setUser(null)
      setToken(null)
      setFirebaseUser(null)
      if (typeof window !== 'undefined') {
        localStorage.removeItem('authToken')
      }
      toast.success('Signed out successfully')
    } catch (error: any) {
      toast.error('Sign out failed')
      throw error
    }
  }

  const updateProfile = async (data: Partial<User>) => {
    // Best-effort: persist to backend if endpoint exists and update local state
    try {
      // try common endpoints - backend may expose either /users/me or /users/:id
      let res = null
      try {
        res = await apiClient.put('/users/me', data)
      } catch (e) {
        // try fallback
        if (user?.id) {
          try {
            res = await apiClient.put(`/users/${user.id}`, data)
          } catch (e2) {
            // ignore
          }
        }
      }

      // If backend returned updated user, use it; otherwise merge locally
      if (res && res.data && (res.data.user || res.data)) {
        const updatedUser = res.data.user || res.data
        setUser(updatedUser)
        return updatedUser
      }

      // Fallback: merge into local user state
      setUser((u) => (u ? { ...u, ...data } as User : u))
      return null
    } catch (err) {
      console.warn('Failed to update profile (best-effort):', err)
      throw err
    }
  }

  const setLocalRole = (role: string | null) => {
    setUser((u) => {
      if (!u) return u
      try {
        if (typeof window !== 'undefined') {
          if (role === 'OWNER' || role === 'TENANT') localStorage.setItem('preferredRole', role)
        }
      } catch (e) {}
      return { ...u, role: role ?? u.role }
    })
  }

  const value = {
    user,
    firebaseUser,
    token,
    loading,
    signIn,
    signUp,
    signInWithGoogle,
    setLocalRole,
    signOut,
    updateProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
