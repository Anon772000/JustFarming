import os, json, asyncio
from paho.mqtt import client as mqtt_client
from ..core.config import settings
import httpx

# Example MQTT -> API bridge (very basic)
TOPIC = "farmdeck/sensors/+/state"  # e.g., farmdeck/sensors/water_tank_1/state

def on_message(client, userdata, msg):
    try:
        payload = json.loads(msg.payload.decode())
    except Exception:
        return
    # optional: extract sensor name from topic
    parts = msg.topic.split('/')
    sensor_name = parts[2] if len(parts) >= 3 else payload.get('name')
    if not sensor_name:
        return
    # Forward to backend API (self) to persist
    asyncio.run(send_to_api(sensor_name, payload))

async def send_to_api(sensor_name: str, payload: dict):
    async with httpx.AsyncClient() as http:
        # 1) ensure sensor exists (idempotent creates would be nicer; simplified here)
        await http.post("http://localhost:8000/api/v1/sensors", json={
            "name": sensor_name,
            "type": payload.get("type", "generic")
        })
        # 2) update value (assumes sensor id lookup elsewhere; for demo, this is kept simple)
        # In a real app: GET sensors, match by name, then POST value to /{id}/value
        # omitted for brevity
        pass

def run():
    client = mqtt_client.Client(mqtt_client.CallbackAPIVersion.VERSION2)
    client.on_message = on_message
    client.connect(settings.MQTT_BROKER_URL, settings.MQTT_BROKER_PORT, 60)
    client.subscribe(TOPIC)
    client.loop_forever()

if __name__ == "__main__":
    run()
