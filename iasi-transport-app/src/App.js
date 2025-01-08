import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { Container, Form, Spinner, Alert, Button } from "react-bootstrap";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import L from "leaflet";
import "bootstrap/dist/css/bootstrap.min.css";
import "leaflet/dist/leaflet.css";

// Fix for Leaflet's default icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require("leaflet/dist/images/marker-icon-2x.png"),
  iconUrl: require("leaflet/dist/images/marker-icon.png"),
  shadowUrl: require("leaflet/dist/images/marker-shadow.png"),
});

const API_URL = "https://api.tranzy.ai/v1/opendata";
const API_KEY = "LOt8uXBDpxCgzVxELsKhPxMt7cHKa0Jpaqq6hDlE"; // Replace with your API key

// Map vehicle_type codes to human-readable names
const VEHICLE_TYPES = {
  0: "Tram",
  1: "Subway",
  2: "Rail",
  3: "Bus",
  4: "Ferry",
  5: "Cable Tram",
  6: "Aerial Lift",
  7: "Funicular",
  11: "Trolleybus",
  12: "Monorail",
};

// Custom icons for different vehicle types
const createCustomIcon = (vehicleType) => {
  let iconUrl;
  let iconSize = [30, 30]; // Larger icons

  switch (vehicleType) {
    case "Tram":
      iconUrl = "https://cdn.icon-icons.com/icons2/1448/PNG/512/42537tram_99053.png"; // Tram icon
      break;
    case "Bus":
      iconUrl = "https://cdn-icons-png.flaticon.com/512/9249/9249336.png"; // Bus icon
      break;
    default:
      iconUrl = "../public/tram.png"; // Default icon
  }

  return L.icon({
    iconUrl: iconUrl,
    iconSize: iconSize,
    iconAnchor: [15, 15], // Center the icon
    popupAnchor: [0, -15], // Adjust popup position
  });
};

function App() {
  const [stops, setStops] = useState([]);
  const [routes, setRoutes] = useState([]); // Store routes
  const [agencyId, setAgencyId] = useState(1); // Hardcoded for Iași
  const [selectedStop, setSelectedStop] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedRoute, setSelectedRoute] = useState(null); // Track the selected route
  const [routeShape, setRouteShape] = useState([]); // Store the shape of the selected route
  const mapRef = useRef(null); // Ref to access the map instance

  // Fetch all stops for Iași
  useEffect(() => {
    const fetchStops = async () => {
      setLoading(true);
      try {
        const response = await axios.get(`${API_URL}/stops`, {
          headers: {
            "X-API-KEY": API_KEY,
            "X-Agency-Id": agencyId,
            "Content-Type": "application/json",
          },
        });
        if (response.data && Array.isArray(response.data)) {
          // Filter out stops with missing coordinates
          const validStops = response.data.filter(
            (stop) => stop.stop_lat && stop.stop_lon
          );
          setStops(validStops);
        } else {
          setError("No data found in the response.");
        }
      } catch (err) {
        setError("Failed to fetch stops. Please try again later.");
        console.error("API Error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchStops();
  }, [agencyId]);

  // Fetch all routes for Iași
  useEffect(() => {
    const fetchRoutes = async () => {
      setLoading(true);
      try {
        const response = await axios.get(`${API_URL}/routes`, {
          headers: {
            "X-API-KEY": API_KEY,
            "X-Agency-Id": agencyId,
            "Content-Type": "application/json",
          },
        });
        if (response.data && Array.isArray(response.data)) {
          setRoutes(response.data);
        } else {
          setError("No data found in the response.");
        }
      } catch (err) {
        setError("Failed to fetch routes. Please try again later.");
        console.error("API Error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchRoutes();
  }, [agencyId]);

  // Fetch real-time vehicle positions for the selected stop
  const fetchVehiclePositions = async () => {
    if (!selectedStop || !selectedStop.stop_id) {
      setError("No stop selected.");
      return;
    }

    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/vehicles?stop_id=${selectedStop.stop_id}`, {
        headers: {
          "X-API-KEY": API_KEY,
          "X-Agency-Id": agencyId,
        },
      });
      if (response.data && Array.isArray(response.data)) {
        // Map vehicle_type codes to human-readable names
        const vehiclesWithType = response.data.map((vehicle) => ({
          ...vehicle,
          vehicle_type: VEHICLE_TYPES[vehicle.vehicle_type] || "Unknown", // Fallback for unknown types
        }));

        // Link vehicles to routes
        const vehiclesWithRoutes = vehiclesWithType.map((vehicle) => {
          const route = routes.find((r) => r.route_id === vehicle.route_id);
          return {
            ...vehicle,
            route_short_name: route ? route.route_short_name : "Unknown", // Add route_short_name
            route_long_name: route ? route.route_long_name : "Unknown", // Add route_long_name
          };
        });

        // Filter out vehicles with unknown or invalid data
        const validVehicles = vehiclesWithRoutes.filter(
          (vehicle) =>
            vehicle.route_short_name !== "Unknown" &&
            vehicle.route_long_name !== "Unknown" &&
            vehicle.latitude &&
            vehicle.longitude
        );

        setVehicles(validVehicles);
      } else {
        setError("No data found in the response.");
      }
    } catch (err) {
      setError("Failed to fetch vehicle positions. Please try again later.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch the shape of the selected route
  const fetchShape = async (shapeId) => {
    try {
      const response = await axios.get(`${API_URL}/shapes?shape_id=${shapeId}`, {
        headers: {
          "X-API-KEY": API_KEY,
          "X-Agency-Id": agencyId,
        },
      });
      if (response.data && Array.isArray(response.data)) {
        const shapeCoords = response.data.map((point) => [point.shape_pt_lat, point.shape_pt_lon]);
        setRouteShape(shapeCoords);
      } else {
        setError("No shape data found.");
      }
    } catch (err) {
      setError("Failed to fetch shape data.");
      console.error(err);
    }
  };

  // Poll the API for real-time updates
  useEffect(() => {
    if (!selectedStop) return;

    const interval = setInterval(() => {
      fetchVehiclePositions();
    }, 5000); // Fetch updates every 5 seconds

    return () => clearInterval(interval); // Cleanup interval on unmount
  }, [selectedStop]);

  // Handle stop selection
  const handleStopSelection = (e) => {
    const stopId = Number(e.target.value);
    const stop = stops.find((s) => s.stop_id === stopId);
    if (stop) {
      setSelectedStop(stop);
      setSelectedRoute(null); // Reset selected route
      setRouteShape([]); // Reset route shape
    } else {
      setError("Invalid stop selected.");
    }
  };

  // Handle route selection
  const handleRouteSelection = (e) => {
    const routeShortName = e.target.value;
    setSelectedRoute(routeShortName);

    // Fetch the shape for the selected route
    const route = routes.find((r) => r.route_short_name === routeShortName);
    if (route && route.shape_id) {
      fetchShape(route.shape_id);
    }
  };

  // Get vehicles for the selected route
  const getVehiclesForRoute = () => {
    if (!selectedRoute) return [];
    return vehicles.filter((vehicle) => vehicle.route_short_name === selectedRoute);
  };

  // Separate routes into Trams and Buses
  const tramRoutes = vehicles.filter((vehicle) => vehicle.vehicle_type === "Tram");
  const busRoutes = vehicles.filter((vehicle) => vehicle.vehicle_type === "Bus");

  return (
    <Container className="mt-4">
      <h1 className="text-center mb-4">Iași Public Transport</h1>

      {/* Stop Selector */}
      {stops.length > 0 && (
        <Form.Group className="mb-4">
          <Form.Label>Select a Bus/Tram Stop</Form.Label>
          <Form.Control as="select" onChange={handleStopSelection}>
            <option value="">Choose a stop...</option>
            {stops.map((stop) => (
              <option key={stop.stop_id} value={stop.stop_id}>
                {stop.stop_name || "Unnamed Stop"}
              </option>
            ))}
          </Form.Control>
        </Form.Group>
      )}

      {/* Fetch Vehicles Button */}
      {selectedStop && (
        <div className="text-center mb-4" style={{ border: "2px solid blue" }}>
          <Button variant="primary" onClick={fetchVehiclePositions} disabled={loading}>
            {loading ? "Loading..." : "Fetch Vehicles"}
          </Button>
        </div>
      )}

      {/* Loading Spinner */}
      {loading && (
        <div className="text-center">
          <Spinner animation="border" role="status">
            <span className="visually-hidden">Loading...</span>
          </Spinner>
        </div>
      )}

      {/* Error Message */}
      {error && <Alert variant="danger">{error}</Alert>}

      {/* Route Selector */}
      {vehicles.length > 0 && (
        <Form.Group className="mb-4">
          <Form.Label>Select a Route</Form.Label>
          <Form.Control as="select" onChange={handleRouteSelection}>
            <option value="">Choose a route...</option>
            <optgroup label="Trams">
              {[...new Set(tramRoutes.map((vehicle) => vehicle.route_short_name))].map((route) => (
                <option key={route} value={route}>
                  Tram {route}
                </option>
              ))}
            </optgroup>
            <optgroup label="Buses">
              {[...new Set(busRoutes.map((vehicle) => vehicle.route_short_name))].map((route) => (
                <option key={route} value={route}>
                  Bus {route}
                </option>
              ))}
            </optgroup>
          </Form.Control>
        </Form.Group>
      )}

      {/* Map with Vehicles for Selected Route */}
      {selectedRoute && (
        <div style={{ border: "2px solid red", height: "400px", width: "100%" }}>
          <MapContainer
            center={[47.1585, 27.6014]} // Default center for Iași
            zoom={13}
            style={{ height: "100%", width: "100%" }}
            ref={mapRef}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            {/* Draw the route shape */}
            {routeShape.length > 0 && (
              <Polyline positions={routeShape} color="blue" />
            )}
            {/* Display vehicles with custom icons */}
            {getVehiclesForRoute().map((vehicle) => (
              <Marker
                key={vehicle.id}
                position={[vehicle.latitude, vehicle.longitude]}
                icon={createCustomIcon(vehicle.vehicle_type)} // Use custom icon
              >
                <Popup>
                  <strong>{vehicle.vehicle_type} {vehicle.route_short_name}</strong> <br />
                  {vehicle.route_long_name} <br />
                  Latitude: {vehicle.latitude.toFixed(5)} <br />
                  Longitude: {vehicle.longitude.toFixed(5)}
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      )}
    </Container>
  );
}

export default App;