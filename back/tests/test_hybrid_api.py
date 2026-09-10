import asyncio

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

import test_resource_booking as resource
from database import async_session_maker, get_db
from models import Client
from ratelimit import limiter
from routers.booking import miniapp_router as router
from routers.booking.miniapp import Viewer, get_current_client, get_viewer
from services import booking_quotes

enabled = resource.enabled


def test_http_contract_extra_fields_and_quote_ownership(monkeypatch):
    moment = booking_quotes.utcnow
    monkeypatch.setattr(booking_quotes, "utcnow", lambda now=None: moment(now or resource.NOW))
    async def run():
        ids = await resource.seed()
        try:
            async with async_session_maker() as db:
                owner = await db.get(Client, ids["client"])
                stranger = Client(studio_id=ids["studio"], name="Another customer")
                db.add(stranger)
                await db.commit()
            app = FastAPI()
            app.state.limiter = limiter
            app.include_router(router, prefix="/global")
            async def database():
                async with async_session_maker() as session:
                    yield session
            app.dependency_overrides[get_db] = database
            app.dependency_overrides[get_current_client] = lambda: owner
            app.dependency_overrides[get_viewer] = lambda: Viewer(owner, ids["studio"])
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as http:
                body = resource.request(ids).model_dump(mode="json")
                for field, value in [("price", 1), ("duration_min", 1), ("client_id", stranger.id), ("studio_id", 1)]:
                    response = await http.post("/global/booking-quotes", json={**body, field: value})
                    assert response.status_code == 422, response.text
                response = await http.post("/global/booking-quotes", json=body)
                assert response.status_code == 201, response.text
                key = response.json()["quote_id"]
                assert response.json()["terms"]["domain"]["funding"]["price"] == 0
                app.dependency_overrides[get_current_client] = lambda: stranger
                assert (await http.get(f"/global/booking-quotes/{key}")).status_code == 404
                assert (await http.post("/global/bookings", json={"quote_id": key})).status_code == 404
                app.dependency_overrides[get_current_client] = lambda: owner
                response = await http.post("/global/bookings", json={"quote_id": key})
                assert response.status_code == 200, response.text
                booking = response.json()
                assert booking["status"] == "active" and booking["payment_url"] is None
                assert (await http.post("/global/bookings", json={"quote_id": key})).json() == booking
                assert (await http.get(f"/global/booking-quotes/{key}")).json() == booking
                response = await http.get("/global/availability", params={
                    "service_id": ids["service"], "branch_id": ids["branch_a"],
                    "date_from": str(resource.hours.DAY), "date_to": str(resource.hours.DAY),
                    "studio_id": "public-code",
                })
                assert response.status_code == 200, response.text
                assert set(response.json()) == {"slots", "reason"}
                response = await http.get("/global/lessons/my")
                assert response.status_code == 200, response.text
                assert response.json()["upcoming"][0]["reservation_id"] == booking["reservation_id"]
                url = f'/global/bookings/{booking["reservation_id"]}/cancel'
                app.dependency_overrides[get_current_client] = lambda: stranger
                assert (await http.post(url)).status_code == 404
                app.dependency_overrides[get_current_client] = lambda: owner
                cancelled = await http.post(url)
                assert cancelled.status_code == 200, cancelled.text
                assert cancelled.json()["status"] == "cancelled"
                assert (await http.post(url)).json() == cancelled.json()
                history = (await http.get("/global/lessons/my")).json()
                assert history["upcoming"] == [] and history["past"] == []
                assert history["cancelled"][0]["reservation_id"] == booking["reservation_id"]
                assert history["cancelled"][0]["allowed_actions"] == []
        finally:
            await resource.cleanup(ids)
    asyncio.run(run())
