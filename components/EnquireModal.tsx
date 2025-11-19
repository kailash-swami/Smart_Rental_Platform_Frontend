import React, { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/lib/AuthContext'
import { chatAPI } from '@/lib/api'
import toast from 'react-hot-toast'
import { useSocket } from '@/lib/socket'

interface EnquireModalProps {
  propertyId: string
  propertyTitle?: string
  onClose: () => void
}

const EnquireModal: React.FC<EnquireModalProps> = ({ propertyId, propertyTitle, onClose }) => {
  const { user } = useAuth()
  const [message, setMessage] = useState(`Hi, I'm interested in this property${propertyTitle ? ': ' + propertyTitle : ''}. Is it still available?`)
  const [sending, setSending] = useState(false)
  const [messages, setMessages] = useState<any[]>([])
  const { socket, connected, onMessage } = useSocket(user?.id ?? undefined)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    // keep placeholder trimmed
    if (!message) setMessage('Hi, I am interested in this property. Is it available?')
  }, [])

  useEffect(() => {
    if (!onMessage) return
    const off = onMessage((m: any) => {
      try {
        if (!user) return
        const isRelated = (m?.sender?.id === user.id) || (m?.receiver?.id === user.id)
        if (!isRelated) return
        setMessages((p) => [...p, m])
        setTimeout(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }), 50)
      } catch (e) {
        console.warn('message handler error', e)
      }
    })
    return () => { if (off) off() }
  }, [onMessage, user])

  const handleSend = async () => {
    if (!user) return toast.error('Please sign in to message the owner')
    if (!message || message.trim().length === 0) return toast.error('Please write a message')
    setSending(true)
    try {
      const resp = await chatAPI.sendMessageToOwner(propertyId, message.trim())
      toast.success('Message sent to owner')
      if (resp && resp.data && resp.data.message) {
        setMessages((p) => [...p, resp.data.message])
      } else {
        setMessages((p) => [...p, { id: `local-${Date.now()}`, content: message.trim(), sender: { id: user.id }, receiver: { id: 'owner' } }])
      }
      setMessage('')
    } catch (err: any) {
      console.error('Failed to send message', err)
      toast.error(err?.response?.data?.error || 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black opacity-40" onClick={onClose}></div>
      <div className="bg-white rounded-lg shadow-lg p-6 z-10 w-full max-w-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Message Owner</h3>
          <button onClick={onClose} className="text-sm text-gray-500">Close</button>
        </div>

        <p className="text-sm text-gray-600 mb-3">Your message will be delivered to the property owner. Their name will not be shown here.</p>

        <div className="mb-3 h-56 overflow-y-auto border rounded p-2" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="text-sm text-gray-500">No messages yet. Your enquiry will be delivered to the owner.</div>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`p-2 my-1 rounded ${m?.sender?.id === user?.id ? 'bg-primary-50 text-right' : 'bg-gray-100 text-left'}`}>
                <div className="text-xs text-gray-500">
                  {m?.sender?.id === user?.id ? 'You' : 'Owner'}
                </div>
                <div className="text-sm">{m.content}</div>
              </div>
            ))
          )}
        </div>

        <textarea value={message} onChange={(e)=>setMessage(e.target.value)} rows={3} className="w-full p-3 border rounded mb-3" placeholder="Write your message" />

        <div className="flex items-center justify-end space-x-2">
          <button onClick={onClose} className="px-4 py-2">Close</button>
          <button onClick={handleSend} disabled={sending} className="px-4 py-2 bg-primary-600 text-white rounded">
            {sending ? 'Sending...' : 'Send Enquiry'}
          </button>
        </div>

      </div>
    </div>
  )
}

export default EnquireModal
