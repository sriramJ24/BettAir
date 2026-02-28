from flask import Blueprint, current_app, jsonify, request, render_template
import requests

main_bp = Blueprint("main", __name__)


def _geocode_address(address: str, api_key: str) -> tuple[float, float, str] | tuple[None, None, str]:
    """Return (lat, lng, formatted_address) from Geocodio."""
    try:
        response = requests.get(
            "https://api.geocod.io/v1.7/geocode",
            params={"q": address, "api_key": api_key, "limit": 1},
            timeout=8,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        raise RuntimeError(f"Geocodio request failed: {exc}") from exc

    payload = response.json()
    results = payload.get("results", [])
    if not results:
        return None, None, ""

    first = results[0]
    location = first.get("location", {})
    lat = location.get("lat")
    lng = location.get("lng")
    formatted = first.get("formatted_address", "")
    return lat, lng, formatted


def _fetch_airnow(lat: float, lng: float, api_key: str):
    try:
        response = requests.get(
            "https://www.airnowapi.org/aq/observation/latLong/current/",
            params={
                "format": "application/json",
                "latitude": lat,
                "longitude": lng,
                "distance": 25,
                "API_KEY": api_key,
            },
            timeout=8,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        raise RuntimeError(f"AirNow request failed: {exc}") from exc

    return response.json()


@main_bp.get("/api/air-quality")
def get_air_quality():
    address = request.args.get("address", "").strip()
    if not address:
        return jsonify({"error": "address query param is required"}), 400

    geocodio_key = current_app.config.get("GEOCODIO_API_KEY")
    airnow_key = current_app.config.get("AIRNOW_API_KEY")
    if not geocodio_key:
        return jsonify({"error": "GEOCODIO_API_KEY not configured"}), 500
    if not airnow_key:
        return jsonify({"error": "AIRNOW_API_KEY not configured"}), 500

    try:
        lat, lng, formatted_address = _geocode_address(address, geocodio_key)
        if lat is None or lng is None:
            return jsonify({"error": "No geocoding results for that address"}), 404

        airnow_data = _fetch_airnow(lat, lng, airnow_key)
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 502

    return jsonify(
        {
            "input_address": address,
            "formatted_address": formatted_address,
            "latitude": lat,
            "longitude": lng,
            "airnow_observations": airnow_data,
        }
    )

@main_bp.get("/api/air-quality/coordinates-only")
def get_air_quality_coordinates_only():
    lat_raw = request.args.get("lat", "")
    lng_raw = request.args.get("lng", "")
    
    
    if not lat_raw or not lng_raw:
        return jsonify({"error": "Latitude or Longitude was not inputted, blank values were given."}), 400
    
    try:
        lat = float(lat_raw)
        lng = float(lng_raw)
    except ValueError:
        return jsonify({"error":"Must be numeric and not be a string (e.g. 0.0)"}), 400
    
    if lat > 90:
        return jsonify({"error": "Please enter a latitude value <= 90"}), 400
    
    elif lat < -90:
        return jsonify({"error": "Please enter a latitude value >= -90"}), 400
    
    elif lng > 180:
        return jsonify({"error": "Please enter a longitude value <= 180"}), 400
    
    elif lng < -180:
        return jsonify({"error": "Please enter a longitude value >= -180"}), 400
    
    airnow_key = current_app.config.get("AIRNOW_API_KEY")
    
    if not airnow_key:
        return jsonify({"error": "AIRNOW_API_KEY not configured"}), 500
    
    try:
        airnow_data = _fetch_airnow(lat, lng, airnow_key)
    
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 502
    
    return jsonify({
        "latitude": lat,
        "longitude": lng,
        "airnow_observations": airnow_data
    })


@main_bp.route("/")
def index():
    return render_template("dashboard.html")
