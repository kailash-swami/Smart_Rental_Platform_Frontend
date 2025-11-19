// API client configuration with axios
import axios from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('authToken')
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    try {
      const resp = error.response
      const req = error.config
      // Log useful debug info for investigation (do not log sensitive tokens)
      if (typeof window !== 'undefined') {
        console.warn('[apiClient] HTTP error:', {
          status: resp?.status,
          url: req?.url || (req?.baseURL ? req.baseURL + req.url : req?.url),
          method: req?.method,
          data: resp?.data,
        })
      } else {
        // server-side or SSR: print to stderr
        console.warn('[apiClient] HTTP error:', resp?.status, req?.method, req?.url, resp?.data)
      }

      if (resp?.status === 401) {
        // Clear auth and redirect to login
        if (typeof window !== 'undefined') {
          localStorage.removeItem('authToken')
          window.location.href = '/auth/login'
        }
      }
    } catch (logErr) {
      // If logging fails for any reason, fall back to original behavior
      if (error.response?.status === 401) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('authToken')
          window.location.href = '/auth/login'
        }
      }
    }
    return Promise.reject(error)
  }
)

// API helper functions



export const propertyAPI = {
  search: (filters: any) => apiClient.get('/properties/search', { params: filters }),
  getById: (id: string) => apiClient.get(`/properties/${id}`),
  my: (ownerId: string, opts: any = {}) => apiClient.get('/properties/search', { params: { ownerId, limit: opts.limit ?? 100 } }),
  create: (formData: FormData, token?: string | null, ownerEmail?: string | null) => {
    // Use apiClient so request interceptor can add stored `authToken` automatically.
    // Allow explicit `token` param (Firebase ID token) to override the header.
    const headers: any = { 'Content-Type': 'multipart/form-data' }
    if (token) headers.Authorization = `Bearer ${token}`
    if (ownerEmail) headers['x-owner-email'] = ownerEmail
    return apiClient.post('/properties', formData, { headers })
  },
  update: (id: string, data: any) => apiClient.put(`/properties/${id}`, data),
  delete: (id: string) => apiClient.delete(`/properties/${id}`),
  uploadPhotos: (id: string, files: File[]) => {
    const form = new FormData()
    files.forEach((f) => form.append('images', f))
    const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null
    const headers: any = { 'Content-Type': 'multipart/form-data' }
    if (token) headers.Authorization = `Bearer ${token}`
    return axios.post(`${API_URL}/properties/${id}/photos`, form, { headers })
  },
}

export const chatAPI = {
  getConversations: (userId: string) => apiClient.get(`/chat/conversations/${userId}`),
  sendMessage: (data: any) => apiClient.post('/chat/messages', data),
  sendMessageToOwner: (propertyId: string, content: string) => apiClient.post('/chat/message-to-owner', { propertyId, content }),
}

export const authAPI = {
  session: (firebaseToken: string) => apiClient.post('/auth/session', {}, {
    headers: { Authorization: `Bearer ${firebaseToken}` }
  }),
}
