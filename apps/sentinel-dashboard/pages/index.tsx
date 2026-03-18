import DemoBanner from "../components/DemoBanner"
import { useState } from "react"

export default function Home() {

    const [status, setStatus] = useState("unknown")

    async function checkHealth() {
        const res = await fetch("http://localhost:4001/health")
        const data = await res.json()
        setStatus(data.status)
    }

    return (
        <div style={{ fontFamily: "sans-serif" }}>

            <DemoBanner />

            <div style={{ padding: 40 }}>

                <h1>Sentinel AI Command Center</h1>
                <p>Sentinel AI by Cody Nunn | Nunn Cloud</p>

                <h2>System Status</h2>
                <p>{status}</p>

                <button onClick={checkHealth}>
                    Check Sentinel Health
                </button>

            </div>

        </div>
    )
}
