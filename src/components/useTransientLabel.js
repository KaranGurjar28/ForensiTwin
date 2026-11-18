import { useEffect, useState } from 'react'
import { useStore } from '../store.js'

// Every add, duplicate, or click publishes a new sequence number in the store.
// Repeated clicks on the already-selected item therefore restart the five seconds.
export default function useTransientLabel(id) {
  const event = useStore((s) => s.labelEvent)
  const [visible, setVisible] = useState(false)
  const [generation, setGeneration] = useState(0)

  useEffect(() => {
    if (!event || event.id !== id) {
      setVisible(false)
      return
    }
    setVisible(true)
    setGeneration((n) => n + 1)
    const timer = window.setTimeout(() => setVisible(false), 5000)
    return () => window.clearTimeout(timer)
  }, [id, event?.id, event?.seq])

  return { visible, generation }
}