require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Configuration, OpenAIApi } = require('openai');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Configure OpenAI
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

// Google Places API configuration
const googleMapsClient = require('@google/maps').createClient({
  key: process.env.GOOGLE_PLACES_API_KEY,
  Promise: Promise
});

// Flight search API configuration (example using Skyscanner API)
const skyscannerApiKey = process.env.SKYSCANNER_API_KEY;

// Helper function to get place details
async function getPlaceDetails(placeId) {
  return new Promise((resolve, reject) => {
    googleMapsClient.place({ placeid: placeId }).asPromise()
      .then((response) => {
        resolve(response.json.result);
      })
      .catch((err) => {
        reject(err);
      });
  });
}

// Helper function to search for places
async function searchPlaces(query, location, type) {
  return new Promise((resolve, reject) => {
    googleMapsClient.places({
      query: query,
      location: location,
      type: type
    }).asPromise()
      .then((response) => {
        resolve(response.json.results);
      })
      .catch((err) => {
        reject(err);
      });
  });
}

// Helper function to get flight options
async function getFlightOptions(origin, destination, date) {
  try {
    const response = await axios.get(`https://skyscanner-skyscanner-flight-search-v1.p.rapidapi.com/apiservices/browsequotes/v1.0/US/USD/en-US/${origin}/${destination}/${date}`, {
      headers: {
        'x-rapidapi-key': skyscannerApiKey,
        'x-rapidapi-host': 'skyscanner-skyscanner-flight-search-v1.p.rapidapi.com'
      }
    });
    return response.data.Quotes;
  } catch (error) {
    console.error('Error fetching flight options:', error);
    return [];
  }
}

// Main tour planning endpoint
app.post('/api/plan-tour', async (req, res) => {
  try {
    const { destination, duration, interests, budget } = req.body;

    // Get destination details
    const destinationDetails = await searchPlaces(destination, null, null);
    if (destinationDetails.length === 0) {
      return res.status(400).json({ error: 'Destination not found' });
    }
    const destinationId = destinationDetails[0].place_id;
    const destinationInfo = await getPlaceDetails(destinationId);

    // Get hotels
    const hotels = await searchPlaces('hotels', destinationInfo.geometry.location, 'lodging');

    // Get restaurants
    const restaurants = await searchPlaces('restaurants', destinationInfo.geometry.location, 'restaurant');

    // Get attractions
    const attractions = await searchPlaces('attractions', destinationInfo.geometry.location, 'tourist_attraction');

    // Get flight options (assuming origin is New York for this example)
    const flightOptions = await getFlightOptions('NYC', destination, '2023-07-01');

    // Use OpenAI to generate a personalized tour plan
    const completion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a travel planning assistant. Create a detailed day-by-day itinerary based on the provided information." },
        { role: "user", content: `Create a ${duration}-day tour plan for ${destination}. Interests: ${interests.join(', ')}. Budget: $${budget}. Include suggestions for hotels, restaurants, and attractions.` }
      ],
    });

    const tourPlan = completion.data.choices[0].message.content;

    // Prepare the response
    const response = {
      destination: destinationInfo.name,
      tourPlan: tourPlan,
      hotels: hotels.slice(0, 5).map(hotel => ({
        name: hotel.name,
        rating: hotel.rating,
        address: hotel.vicinity
      })),
      restaurants: restaurants.slice(0, 10).map(restaurant => ({
        name: restaurant.name,
        rating: restaurant.rating,
        address: restaurant.vicinity
      })),
      attractions: attractions.slice(0, 15).map(attraction => ({
        name: attraction.name,
        rating: attraction.rating,
        address: attraction.vicinity
      })),
      flightOptions: flightOptions.slice(0, 5).map(flight => ({
        price: flight.MinPrice,
        direct: flight.Direct,
        carrier: flight.OutboundLeg.CarrierIds[0]
      }))
    };

    res.json(response);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'An error occurred while processing your request.' });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
