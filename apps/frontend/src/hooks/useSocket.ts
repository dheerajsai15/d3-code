import { useEffect, useState } from "react"

export function useSocket() {
  const [ws, setWs] = useState(() => new WebSocket("ws://localhost:8080"))
  const [loading, setLoading] = useState(true);

    useEffect(() => {
      ws.onopen = () => {
        setLoading(false);
      }
    }, [ws])

  return {
    socket: ws,
    loading: loading
  }
}