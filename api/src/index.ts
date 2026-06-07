// Polyfill must be first — before any @azure/cosmos imports
import './polyfill';

// Function registrations
import './functions/events';
import './functions/ratings';
import './functions/whiskeys';
import './functions/health';
