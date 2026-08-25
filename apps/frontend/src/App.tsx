import { useEffect, useState } from 'react'
import './App.css'

function App() {
  const [ws, setWs] = useState(new WebSocket("ws://localhost:8080"))

  useEffect(() => {
    ws.onopen = () => {
      if (ws) {
        ws.send("Hi there")
      }
    }
  },
  [ws])

  return (
    <>
      Hi There
    </>
  )
}

export default App
