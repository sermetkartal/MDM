package geo

import (
	"math"

	"github.com/sermetkartal/mdm/services/geofence-service/internal/model"
)

const earthRadiusMeters = 6371000.0

// PointInCircle checks whether a point is within a circle defined by center and radius.
func PointInCircle(point model.Point, center model.Point, radiusMeters float64) bool {
	distance := HaversineDistance(point, center)
	return distance <= radiusMeters
}

// PointInPolygon uses the ray-casting algorithm to determine if a point is inside a polygon.
func PointInPolygon(point model.Point, polygon []model.Point) bool {
	n := len(polygon)
	if n < 3 {
		return false
	}

	inside := false
	j := n - 1
	for i := 0; i < n; i++ {
		if (polygon[i].Lng > point.Lng) != (polygon[j].Lng > point.Lng) &&
			point.Lat < (polygon[j].Lat-polygon[i].Lat)*(point.Lng-polygon[i].Lng)/(polygon[j].Lng-polygon[i].Lng)+polygon[i].Lat {
			inside = !inside
		}
		j = i
	}
	return inside
}

// HaversineDistance calculates the distance in meters between two geographic points.
func HaversineDistance(a, b model.Point) float64 {
	dLat := degreesToRadians(b.Lat - a.Lat)
	dLng := degreesToRadians(b.Lng - a.Lng)

	lat1 := degreesToRadians(a.Lat)
	lat2 := degreesToRadians(b.Lat)

	h := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Sin(dLng/2)*math.Sin(dLng/2)*math.Cos(lat1)*math.Cos(lat2)
	c := 2 * math.Atan2(math.Sqrt(h), math.Sqrt(1-h))

	return earthRadiusMeters * c
}

func degreesToRadians(deg float64) float64 {
	return deg * math.Pi / 180
}
