import { useCallback, useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { MAPBOX_ACCESS_TOKEN } from '../../js/config.js'

const mapStyles = [
  { id: 'dark', label: 'Dark', url: 'mapbox://styles/mapbox/dark-v11' },
  { id: 'streets', label: 'Streets', url: 'mapbox://styles/mapbox/streets-v12' },
  { id: 'light', label: 'Light', url: 'mapbox://styles/mapbox/light-v11' },
  { id: 'satellite', label: 'Satellite', url: 'mapbox://styles/mapbox/satellite-streets-v12' },
]

export default function PartnerUniversityMap({ airports, universities, homeUniversity, selectedUniversity, onSelect, onResetSelection, showAirport }) {
  const mapContainer = useRef(null)
  const map = useRef(null)
  const markers = useRef([])
  const airportMarker = useRef(null)
  const [styleId, setStyleId] = useState('streets')

  const addMarkers = useCallback(() => {
    if (!map.current) return
    markers.current.forEach((marker) => marker.remove())
    markers.current = universities.flatMap((university) => {
      if (university.latitude == null || university.longitude == null) return []
      const marker = new mapboxgl.Marker({ color: '#00d4ff' })
        .setLngLat([university.longitude, university.latitude])
        .addTo(map.current)
      marker.getElement().addEventListener('click', () => onSelect(university.university_id))
      return [marker]
    })
  }, [universities, onSelect])

  useEffect(() => {
    if (!mapContainer.current || homeUniversity?.longitude == null || homeUniversity?.latitude == null) return undefined
    mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: mapStyles.find((style) => style.id === 'streets').url,
      center: [homeUniversity.longitude, homeUniversity.latitude],
      zoom: 12,
    })
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right')
    return () => {
      airportMarker.current?.remove()
      map.current?.remove()
      map.current = null
    }
  }, [homeUniversity])

  useEffect(() => {
    if (!map.current) return undefined
    addMarkers()
    return () => {
      markers.current.forEach((marker) => marker.remove())
      markers.current = []
    }
  }, [addMarkers])

  const drawAirportRoute = useCallback(() => {
    if (!map.current || !selectedUniversity) return
    const airport = airports[selectedUniversity.name]
    if (!airport?.coordinates || selectedUniversity.latitude == null || selectedUniversity.longitude == null) return
    airportMarker.current?.remove()
    airportMarker.current = new mapboxgl.Marker({ color: '#f0a500' })
      .setLngLat(airport.coordinates)
      .addTo(map.current)
    const sourceData = {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [[selectedUniversity.longitude, selectedUniversity.latitude], airport.coordinates],
      },
    }
    if (map.current.getSource('airport-route')) {
      map.current.getSource('airport-route').setData(sourceData)
      return
    }
    map.current.addSource('airport-route', { type: 'geojson', data: sourceData })
    map.current.addLayer({
      id: 'airport-route-line',
      type: 'line',
      source: 'airport-route',
      paint: { 'line-color': '#f0a500', 'line-width': 4, 'line-dasharray': [2, 1] },
    })
  }, [airports, selectedUniversity])

  const fitAirportRoute = useCallback(() => {
    if (!map.current || !selectedUniversity) return
    const airport = airports[selectedUniversity.name]
    if (!airport?.coordinates || selectedUniversity.latitude == null || selectedUniversity.longitude == null) return
    const bounds = new mapboxgl.LngLatBounds()
    bounds.extend([selectedUniversity.longitude, selectedUniversity.latitude])
    bounds.extend(airport.coordinates)
    map.current.fitBounds(bounds, {
      padding: { top: 100, right: 100, bottom: 100, left: 100 },
      maxZoom: 13,
      duration: 900,
    })
  }, [airports, selectedUniversity])

  useEffect(() => {
    if (!map.current) return
    if (!showAirport) {
      airportMarker.current?.remove()
      airportMarker.current = null
      if (map.current.getLayer('airport-route-line')) map.current.removeLayer('airport-route-line')
      if (map.current.getSource('airport-route')) map.current.removeSource('airport-route')
      return
    }
    const showRoute = () => {
      drawAirportRoute()
      fitAirportRoute()
    }
    if (map.current.isStyleLoaded()) showRoute()
    else map.current.once('style.load', showRoute)
  }, [drawAirportRoute, fitAirportRoute, showAirport])

  const changeStyle = (nextStyleId) => {
    const nextStyle = mapStyles.find((style) => style.id === nextStyleId)
    if (!map.current || !nextStyle || nextStyleId === styleId) return
    onResetSelection()
    setStyleId(nextStyleId)
    map.current.once('style.load', addMarkers)
    map.current.setStyle(nextStyle.url)
  }

  useEffect(() => {
    if (!map.current || !selectedUniversity || selectedUniversity.latitude == null || selectedUniversity.longitude == null) return
    map.current.flyTo({ center: [selectedUniversity.longitude, selectedUniversity.latitude], zoom: 5, duration: 900 })
  }, [selectedUniversity])

  return (
    <div className="partner-directory__map-shell">
      <div className="partner-directory__map" ref={mapContainer} />
      <div className="partner-directory__map-styles" aria-label="Map style">
        {mapStyles.map((style) => (
          <button
            className={style.id === styleId ? 'partner-directory__map-style partner-directory__map-style--active' : 'partner-directory__map-style'}
            type="button"
            key={style.id}
            onClick={() => changeStyle(style.id)}
          >
            {style.label}
          </button>
        ))}
      </div>
    </div>
  )
}
