
# aqi_processor.py - Core AQI calculation and processing module

import pandas as pd
import numpy as np
import requests
import json
import os
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Union, Optional, Tuple

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# AQI breakpoints as per EPA standards
# Format: {pollutant: {range_upper_bound: (index_lower_bound, index_upper_bound)}}
AQI_BREAKPOINTS = {
    'PM2.5': {  # 24-hour average, μg/m3
        12.0: (0, 50),
        35.4: (51, 100),
        55.4: (101, 150),
        150.4: (151, 200),
        250.4: (201, 300),
        350.4: (301, 400),
        500.4: (401, 500)
    },
    'PM10': {  # 24-hour average, μg/m3
        54: (0, 50),
        154: (51, 100),
        254: (101, 150),
        354: (151, 200),
        424: (201, 300),
        504: (301, 400),
        604: (401, 500)
    },
    'O3': {  # 8-hour average, ppm
        0.054: (0, 50),
        0.070: (51, 100),
        0.085: (101, 150),
        0.105: (151, 200),
        0.200: (201, 300),
        0.404: (301, 400),
        0.504: (401, 500)
    },
    'CO': {  # 8-hour average, ppm
        4.4: (0, 50),
        9.4: (51, 100),
        12.4: (101, 150),
        15.4: (151, 200),
        30.4: (201, 300),
        40.4: (301, 400),
        50.4: (401, 500)
    },
    'SO2': {  # 1-hour average, ppb
        35: (0, 50),
        75: (51, 100),
        185: (101, 150),
        304: (151, 200),
        604: (201, 300),
        804: (301, 400),
        1004: (401, 500)
    },
    'NO2': {  # 1-hour average, ppb
        53: (0, 50),
        100: (51, 100),
        360: (101, 150),
        649: (151, 200),
        1249: (201, 300),
        1649: (301, 400),
        2049: (401, 500)
    }
}

# AQI category labels
AQI_CATEGORIES = [
    {'min': 0, 'max': 50, 'category': 'Good', 'color': '#00E400', 
     'description': 'Air quality is satisfactory, and air pollution poses little or no risk.'},
    {'min': 51, 'max': 100, 'category': 'Moderate', 'color': '#FFFF00', 
     'description': 'Air quality is acceptable. However, there may be a risk for some people, particularly those who are unusually sensitive to air pollution.'},
    {'min': 101, 'max': 150, 'category': 'Unhealthy for Sensitive Groups', 'color': '#FF7E00', 
     'description': 'Members of sensitive groups may experience health effects. The general public is less likely to be affected.'},
    {'min': 151, 'max': 200, 'category': 'Unhealthy', 'color': '#FF0000', 
     'description': 'Some members of the general public may experience health effects; members of sensitive groups may experience more serious health effects.'},
    {'min': 201, 'max': 300, 'category': 'Very Unhealthy', 'color': '#8F3F97', 
     'description': 'Health alert: The risk of health effects is increased for everyone.'},
    {'min': 301, 'max': 500, 'category': 'Hazardous', 'color': '#7E0023', 
     'description': 'Health warning of emergency conditions: everyone is more likely to be affected.'}
]

class AQIProcessor:
    """
    Class for processing Air Quality Index data.
    Includes calculation, analysis, and forecasting functions.
    """
    
    def __init__(self, api_key: str = None):
        """
        Initialize the AQI processor.
        
        Args:
            api_key: API key for the air quality data provider
        """
        self.api_key = api_key or os.environ.get('AQI_API_KEY')
        if not self.api_key:
            logger.warning("No API key provided. Some functions may not work.")
    
    def calculate_aqi(self, concentration: float, pollutant: str) -> Optional[int]:
        """
        Calculate AQI for a given pollutant concentration.
        
        Args:
            concentration: Measured concentration of the pollutant
            pollutant: Pollutant type (PM2.5, PM10, O3, CO, SO2, NO2)
            
        Returns:
            Calculated AQI value or None if calculation fails
        """
        try:
            if pollutant not in AQI_BREAKPOINTS:
                logger.error(f"Unknown pollutant: {pollutant}")
                return None
                
            # Find the appropriate breakpoint
            breakpoints = AQI_BREAKPOINTS[pollutant]
            
            # If concentration is above the highest breakpoint, use the highest category
            if concentration > max(breakpoints.keys()):
                # Use the highest breakpoint for calculation
                highest_bp = max(breakpoints.keys())
                i_lo, i_hi = breakpoints[highest_bp]
                bp_lo, bp_hi = highest_bp, highest_bp * 1.5  # Extrapolate for higher values
                return self._calculate_aqi_from_breakpoints(concentration, bp_lo, bp_hi, i_lo, i_hi)
            
            # Find the breakpoint range that contains the concentration
            for bp_hi, (i_lo, i_hi) in sorted(breakpoints.items()):
                if concentration <= bp_hi:
                    # Find the lower breakpoint
                    keys = sorted(breakpoints.keys())
                    idx = keys.index(bp_hi)
                    bp_lo = 0 if idx == 0 else keys[idx - 1]
                    return self._calculate_aqi_from_breakpoints(concentration, bp_lo, bp_hi, i_lo, i_hi)
            
            # Should not reach here if breakpoints are properly defined
            return None
            
        except Exception as e:
            logger.error(f"Error calculating AQI: {e}")
            return None
    
    def _calculate_aqi_from_breakpoints(self, 
                                       concentration: float, 
                                       bp_lo: float, 
                                       bp_hi: float, 
                                       i_lo: int, 
                                       i_hi: int) -> int:
        """
        Calculate AQI using linear interpolation between breakpoints.
        
        Args:
            concentration: Measured concentration of the pollutant
            bp_lo: Lower breakpoint concentration
            bp_hi: Upper breakpoint concentration
            i_lo: Lower breakpoint index
            i_hi: Upper breakpoint index
            
        Returns:
            Calculated AQI value
        """
        aqi = (i_hi - i_lo) * (concentration - bp_lo) / (bp_hi - bp_lo) + i_lo
        return round(aqi)
    
    def get_aqi_category(self, aqi_value: int) -> Dict:
        """
        Get the AQI category information for a given AQI value.
        
        Args:
            aqi_value: AQI value
            
        Returns:
            Dictionary with category information
        """
        for category in AQI_CATEGORIES:
            if category['min'] <= aqi_value <= category['max']:
                return category
        
        # If value is above our defined categories, return hazardous
        if aqi_value > 500:
            return {
                'category': 'Extreme Hazardous',
                'color': '#7E0023',
                'description': 'Extreme health hazard: everyone should avoid all outdoor exertion'
            }
        
        # Should not reach here with valid AQI values
        logger.warning(f"Invalid AQI value: {aqi_value}")
        return {
            'category': 'Unknown',
            'color': '#CCCCCC',
            'description': 'Unknown air quality level'
        }
    
    def get_recommendations(self, aqi_value: int) -> List[str]:
        """
        Get health recommendations based on AQI value.
        
        Args:
            aqi_value: AQI value
            
        Returns:
            List of recommendation strings
        """
        if aqi_value <= 50:  # Good
            return [
                "Air quality is good. Perfect for outdoor activities!",
                "Enjoy outdoor activities with minimal risk from air pollution."
            ]
        elif aqi_value <= 100:  # Moderate
            return [
                "Air quality is acceptable for most people.",
                "Unusually sensitive individuals should consider limiting prolonged outdoor exertion.",
                "People with respiratory diseases should be careful."
            ]
        elif aqi_value <= 150:  # Unhealthy for Sensitive Groups
            return [
                "Members of sensitive groups (elderly, children, those with respiratory or heart disease) may experience health effects.",
                "Consider reducing outdoor physical activities, especially near busy roads.",
                "Sensitive groups should move prolonged or heavy exertion activities indoors or reschedule."
            ]
        elif aqi_value <= 200:  # Unhealthy
            return [
                "Everyone may begin to experience health effects.",
                "Avoid prolonged or heavy outdoor exertion.",
                "Sensitive groups should avoid all outdoor physical activities.",
                "Consider using an N95 respirator mask outdoors if you must go out.",
                "Run air purifiers indoors if available."
            ]
        elif aqi_value <= 300:  # Very Unhealthy
            return [
                "Health alert: everyone may experience more serious health effects.",
                "Avoid all outdoor physical activities.",
                "Stay indoors with windows and doors closed.",
                "Run air purifiers if available.",
                "Wear an N95 respirator mask if you must go outdoors.",
                "Follow local health advice and guidelines."
            ]
        else:  # Hazardous (301+)
            return [
                "Health emergency! Everyone is likely to be affected.",
                "STAY INDOORS with windows and doors closed.",
                "Avoid all physical activity outdoors.",
                "Run air purifiers on highest setting.",
                "Create a clean room if possible.",
                "Wear N95 respirator masks if you must go outside.",
                "Follow evacuation orders if issued by local authorities.",
                "Consider temporary relocation if conditions persist."
            ]
    
    def fetch_aqi_data(self, latitude: float, longitude: float) -> Dict:
        """
        Fetch current AQI data from API for the given coordinates.
        
        Args:
            latitude: Location latitude
            longitude: Location longitude
            
        Returns:
            Dictionary with AQI data
        """
        try:
            # Example using WAQI API - replace with your preferred provider
            url = f"https://api.waqi.info/feed/geo:{latitude};{longitude}/?token={self.api_key}"
            response = requests.get(url, timeout=10)
            data = response.json()
            
            if data['status'] != 'ok':
                logger.error(f"API error: {data.get('data')}")
                raise Exception(f"API error: {data.get('data')}")
            
            # Extract relevant data
            aqi_value = data['data']['aqi']
            dominant_pollutant = data['data'].get('dominentpol', 'PM2.5')  # Default to PM2.5 if not provided
            
            # Get pollutant details
            pollutants = {}
            if 'iaqi' in data['data']:
                for p, v in data['data']['iaqi'].items():
                    if p in AQI_BREAKPOINTS and 'v' in v:
                        pollutants[p] = v['v']
            
            # Get category information
            category_info = self.get_aqi_category(aqi_value)
            
            # Get recommendations
            recommendations = self.get_recommendations(aqi_value)
            
            return {
                'aqi': aqi_value,
                'category': category_info['category'],
                'color': category_info['color'],
                'description': category_info['description'],
                'dominant_pollutant': dominant_pollutant,
                'pollutants': pollutants,
                'recommendations': recommendations,
                'timestamp': datetime.now().isoformat(),
                'location': {
                    'latitude': latitude,
                    'longitude': longitude,
                    'name': data['data'].get('city', {}).get('name', 'Unknown')
                }
            }
            
        except Exception as e:
            logger.error(f"Error fetching AQI data: {e}")
            raise
    
    def analyze_aqi_trend(self, 
                         historical_data: List[Dict], 
                         period: str = 'day') -> Dict:
        """
        Analyze AQI trends from historical data.
        
        Args:
            historical_data: List of historical AQI data points
            period: Analysis period ('day', 'week', 'month', 'year')
            
        Returns:
            Dictionary with trend analysis results
        """
        try:
            if not historical_data:
                return {
                    'average': None,
                    'max': None,
                    'min': None,
                    'trend': 'unknown',
                    'forecast': None
                }
            
            # Convert to DataFrame for easier analysis
            df = pd.DataFrame([
                {
                    'timestamp': datetime.fromisoformat(item['timestamp']),
                    'aqi': item['aqi']
                }
                for item in historical_data
            ])
            
            # Sort by timestamp
            df = df.sort_values('timestamp')
            
            # Basic statistics
            avg_aqi = df['aqi'].mean()
            max_aqi = df['aqi'].max()
            min_aqi = df['aqi'].min()
            
            # Determine trend direction
            if len(df) >= 3:
                # Simple linear regression to determine trend
                x = np.arange(len(df))
                y = df['aqi'].values
                slope, _ = np.polyfit(x, y, 1)
                
                if slope > 0.5:
                    trend = 'rapidly_increasing'
                elif slope > 0.1:
                    trend = 'increasing'
                elif slope < -0.5:
                    trend = 'rapidly_decreasing'
                elif slope < -0.1:
                    trend = 'decreasing'
                else:
                    trend = 'stable'
            else:
                trend = 'unknown'
            
            # Simple forecast (if enough data points)
            forecast = None
            if len(df) >= 5:
                # Use last 5 data points to predict next value
                recent_data = df.tail(5)
                x = np.arange(len(recent_data))
                y = recent_data['aqi'].values
                coeffs = np.polyfit(x, y, 1)
                p = np.poly1d(coeffs)
                
                # Predict next value
                next_value = p(len(recent_data))
                forecast = max(0, round(next_value))  # Ensure non-negative
            
            return {
                'average': round(avg_aqi, 1),
                'max': max_aqi,
                'min': min_aqi,
                'trend': trend,
                'forecast': forecast
            }
            
        except Exception as e:
            logger.error(f"Error analyzing AQI trend: {e}")
            return {
                'average': None,
                'max': None,
                'min': None,
                'trend': 'error',
                'forecast': None,
                'error': str(e)
            }
    
    def predict_aqi(self, 
                   historical_data: List[Dict], 
                   hours_ahead: int = 24) -> List[Dict]:
        """
        Predict future AQI values based on historical data.
        
        Args:
            historical_data: List of historical AQI data points
            hours_ahead: Number of hours to predict ahead
            
        Returns:
            List of predicted AQI values with timestamps
        """
        try:
            if not historical_data or len(historical_data) < 24:
                logger.warning("Insufficient data for reliable prediction")
                return []
            
            # Convert to DataFrame
            df = pd.DataFrame([
                {
                    'timestamp': datetime.fromisoformat(item['timestamp']),
                    'aqi': item['aqi']
                }
                for item in historical_data
            ])
            
            # Sort by timestamp
            df = df.sort_values('timestamp')
            df = df.set_index('timestamp')
            
            # Resample to hourly data if not already hourly
            df_hourly = df.resample('H').mean().fillna(method='ffill')
            
            # Use last 3 days of data for prediction if available
            train_data = df_hourly.tail(72) if len(df_hourly) >= 72 else df_hourly
            
            # Simple time series forecasting
            # Here we're using a simple approach - in a production system,
            # you might want to use more sophisticated methods like ARIMA or Prophet
            
            # Method 1: Use average daily pattern
            # Group by hour of day and calculate mean
            train_data['hour'] = train_data.index.hour
            hourly_pattern = train_data.groupby('hour')['aqi'].mean()
            
            # Generate predictions
            last_timestamp = df_hourly.index[-1]
            predictions = []
            
            for i in range(1, hours_ahead + 1):
                next_time = last_timestamp + timedelta(hours=i)
                hour_of_day = next_time.hour
                
                # Get predicted value from hourly pattern
                predicted_aqi = hourly_pattern[hour_of_day]
                
                # Add some slight randomness based on recent volatility
                recent_std = train_data['aqi'].std() * 0.2
                noise = np.random.normal(0, recent_std)
                predicted_aqi = max(0, round(predicted_aqi + noise))  # Ensure non-negative
                
                # Get category for predicted AQI
                category_info = self.get_aqi_category(predicted_aqi)
                
                predictions.append({
                    'timestamp': next_time.isoformat(),
                    'aqi': predicted_aqi,
                    'category': category_info['category'],
                    'color': category_info['color'],
                    'is_prediction': True
                })
            
            return predictions
            
        except Exception as e:
            logger.error(f"Error predicting AQI: {e}")
            return []
    
    def calculate_exposure_score(self, user_history: List[Dict]) -> Dict:
        """
        Calculate a user's exposure score based on their AQI history.
        
        Args:
            user_history: List of AQI exposures with duration information
            
        Returns:
            Dictionary with exposure assessment
        """
        try:
            if not user_history:
                return {
                    'daily_score': 0,
                    'weekly_score': 0,
                    'monthly_score': 0,
                    'risk_level': 'Low',
                    'recommendations': ['No exposure data available']
                }
            
            # Convert to DataFrame
            df = pd.DataFrame([
                {
                    'timestamp': datetime.fromisoformat(item['timestamp']),
                    'aqi': item['aqi'],
                    'duration_minutes': item.get('duration_minutes', 60)  # Default to 1 hour if not specified
                }
                for item in user_history
            ])
            
            # Sort by timestamp
            df = df.sort_values('timestamp')
            
            # Calculate weighted exposure (AQI * duration in hours)
            df['exposure'] = df['aqi'] * (df['duration_minutes'] / 60)
            
            # Get recent timestamps
            now = datetime.now()
            day_ago = now - timedelta(days=1)
            week_ago = now - timedelta(days=7)
            month_ago = now - timedelta(days=30)
            
            # Calculate scores for different periods
            daily_data = df[df['timestamp'] >= day_ago]
            weekly_data = df[df['timestamp'] >= week_ago]
            monthly_data = df[df['timestamp'] >= month_ago]
            
            # Daily weighted average
            daily_score = 0
            if not daily_data.empty:
                total_duration = daily_data['duration_minutes'].sum() / 60  # Convert to hours
                daily_score = round(daily_data['exposure'].sum() / total_duration)
            
            # Weekly weighted average
            weekly_score = 0
            if not weekly_data.empty:
                total_duration = weekly_data['duration_minutes'].sum() / 60
                weekly_score = round(weekly_data['exposure'].sum() / total_duration)
            
            # Monthly weighted average
            monthly_score = 0
            if not monthly_data.empty:
                total_duration = monthly_data['duration_minutes'].sum() / 60
                monthly_score = round(monthly_data['exposure'].sum() / total_duration)
            
            # Determine risk level based on weekly score
            risk_level = 'Low'
            if weekly_score > 150:
                risk_level = 'Severe'
            elif weekly_score > 100:
                risk_level = 'High'
            elif weekly_score > 50:
                risk_level = 'Moderate'
            
            # Generate recommendations
            recommendations = []
            if risk_level == 'Low':
                recommendations = [
                    'You have maintained good air quality exposure.',
                    'Continue monitoring AQI regularly.'
                ]
            elif risk_level == 'Moderate':
                recommendations = [
                    'Consider reducing outdoor activities when AQI is high.',
                    'Use air purifiers when indoors.',
                    'Keep track of air quality forecasts.'
                ]
            elif risk_level == 'High':
                recommendations = [
                    'Try to spend more time in areas with better air quality.',
                    'Use N95 masks when AQI is unhealthy.',
                    'Consider using air purifiers indoors.',
                    'Reduce outdoor exercise during high pollution periods.'
                ]
            else:  # Severe
                recommendations = [
                    'Your exposure levels are concerning.',
                    'Limit time outdoors as much as possible.',
                    'Use high-quality air purifiers indoors.',
                    'Wear N95 masks when outdoors.',
                    'Consider consulting with a healthcare provider about air pollution exposure.'
                ]
            
            return {
                'daily_score': daily_score,
                'weekly_score': weekly_score,
                'monthly_score': monthly_score,
                'risk_level': risk_level,
                'recommendations': recommendations
            }
            
        except Exception as e:
            logger.error(f"Error calculating exposure score: {e}")
            return {
                'daily_score': 0,
                'weekly_score': 0,
                'monthly_score': 0,
                'risk_level': 'Unknown',
                'recommendations': ['Error calculating exposure score'],
                'error': str(e)
            }


# Utility Functions

def get_nearest_monitoring_stations(latitude: float, longitude: float, radius_km: float = 10) -> List[Dict]:
    """
    Find nearest air quality monitoring stations to a given location.
    
    Args:
        latitude: Location latitude
        longitude: Location longitude
        radius_km: Search radius in kilometers
        
    Returns:
        List of nearby monitoring stations
    """
    try:
        # This is a placeholder implementation
        # In a real application, you would use a more comprehensive API or database
        api_key = os.environ.get('AQI_API_KEY')
        url = f"https://api.waqi.info/map/bounds/?latlng={latitude-0.1},{longitude-0.1},{latitude+0.1},{longitude+0.1}&token={api_key}"
        
        response = requests.get(url, timeout=10)
        data = response.json()
        
        stations = []
        if data.get('status') == 'ok' and 'data' in data:
            for station in data['data']:
                # Calculate distance
                station_lat = station.get('lat')
                station_lon = station.get('lon')
                
                # Skip if coordinates are missing
                if not station_lat or not station_lon:
                    continue
                
                # Calculate rough distance
                # For more accuracy, use haversine formula in a production system
                distance_km = ((station_lat - latitude)**2 + (station_lon - longitude)**2)**0.5 * 111
                
                if distance_km <= radius_km:
                    stations.append({
                        'name': station.get('station', {}).get('name', 'Unknown'),
                        'aqi': station.get('aqi'),
                        'latitude': station_lat,
                        'longitude': station_lon,
                        'distance_km': round(distance_km, 1)
                    })
        
        # Sort by distance
        stations.sort(key=lambda x: x['distance_km'])
        return stations
    
    except Exception as e:
        logger.error(f"Error finding nearby monitoring stations: {e}")
        return []


def compare_locations(locations: List[Dict]) -> Dict:
    """
    Compare air quality between multiple locations.
    
    Args:
        locations: List of location data with AQI information
        
    Returns:
        Dictionary with comparison results
    """
    try:
        if not locations or len(locations) < 2:
            return {
                'best': None,
                'worst': None,
                'average': None,
                'comparison': []
            }
        
        # Create processor instance for category lookups
        processor = AQIProcessor()
        
        # Sort locations by AQI
        sorted_locations = sorted(locations, key=lambda x: x.get('aqi', 0))
        best_location = sorted_locations[0]
        worst_location = sorted_locations[-1]
        
        # Calculate average AQI
        avg_aqi = sum(loc.get('aqi', 0) for loc in locations) / len(locations)
        
        # Create comparison data
        comparison = []
        for loc in locations:
            aqi = loc.get('aqi', 0)
            category_info = processor.get_aqi_category(aqi)
            
            comparison.append({
                'name': loc.get('name', 'Unknown'),
                'aqi': aqi,
                'category': category_info['category'],
                'color': category_info['color'],
                'difference_from_avg': round(aqi - avg_aqi, 1)
            })
        
        return {
            'best': {
                'name': best_location.get('name', 'Unknown'),
                'aqi': best_location.get('aqi', 0)
            },
            'worst': {
                'name': worst_location.get('name', 'Unknown'),
                'aqi': worst_location.get('aqi', 0)
            },
            'average': round(avg_aqi, 1),
            'comparison': comparison
        }
    
    except Exception as e:
        logger.error(f"Error comparing locations: {e}")
        return {
            'best': None,
            'worst': None,
            'average': None,
            'comparison': [],
            'error': str(e)
        }


# Example usage
if __name__ == "__main__":
    # Load API key from environment
    api_key = os.environ.get('AQI_API_KEY')
    
    if not api_key:
        print("Warning: No API key found. Set AQI_API_KEY environment variable.")
        # For demo/test purposes only - don't include API keys in code:
        api_key = "demo_key"
    
    # Create processor instance
    processor = AQIProcessor(api_key)
    
    # Example: Calculate AQI for PM2.5
    pm25_concentration = 15.4
    aqi = processor.calculate_aqi(pm25_concentration, 'PM2.5')
    print(f"PM2.5 concentration of {pm25_concentration} µg/m³ gives AQI of {aqi}")
    
    # Example: Get category info
    category = processor.get_aqi_category(aqi)
    print(f"Category: {category['category']} - {category['description']}")
    
    # Example: Get recommendations
    recommendations = processor.get_recommendations(aqi)
    print("Recommendations:")
    for rec in recommendations:
        print(f"- {rec}")
    
    # Note: Functions that require API access won't work without a valid API key
    print("\nTo fetch real data, set a valid AQI_API_KEY environment variable.")
