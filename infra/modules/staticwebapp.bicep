param swaName string
param swaLocation string
param repositoryUrl string
param repositoryBranch string
param cosmosEndpoint string
@secure()
param cosmosKey string
param cosmosDatabase string
param storageAccountName string
@secure()
param anthropicApiKey string
@secure()
param authSessionSecret string
// Empty when real-time is disabled for this environment.
param signalrName string

resource swa 'Microsoft.Web/staticSites@2023-01-01' = {
  name: swaName
  location: swaLocation
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  tags: {
    displayName: 'WhiskyApp Static Web App'
  }
  properties: {
    repositoryUrl: repositoryUrl
    branch: repositoryBranch
    buildProperties: {
      appLocation: 'frontend'
      apiLocation: 'api'
      outputLocation: 'dist'
    }
  }
}

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageAccountName
}

var blobConnectionString = 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${storageAccount.listKeys().keys[0].value};EndpointSuffix=${environment().suffixes.storage}'

// ANTHROPIC_API_KEY is optional: without it the app runs and only the
// "Recognize with AI" button reports that recognition is not configured.
var aiSettings = empty(anthropicApiKey) ? {} : {
  ANTHROPIC_API_KEY: anthropicApiKey
}

// Signing key for native username/password session cookies. Like
// ANTHROPIC_API_KEY, a deploy without it removes a previously set value.
var authSettings = empty(authSessionSecret) ? {} : {
  AUTH_SESSION_SECRET: authSessionSecret
}

resource signalr 'Microsoft.SignalRService/signalR@2023-02-01' existing = {
  name: signalrName
}

// Omitted when SignalR is disabled, which also removes a previously set value
// (this resource replaces the whole settings set).
var realtimeSettings = empty(signalrName) ? {} : {
  AzureSignalRConnectionString: signalr.listKeys().primaryConnectionString
}

// Only deploy app settings when cosmosKey is provided.
// Deploying with an empty key would silently overwrite a previously correct key.
// Note: this resource replaces the full app settings set, so a deploy without
// anthropicApiKey removes a previously configured ANTHROPIC_API_KEY.
resource appSettings 'Microsoft.Web/staticSites/config@2023-01-01' = if (!empty(cosmosKey)) {
  parent: swa
  name: 'appsettings'
  properties: union({
    COSMOS_ENDPOINT: cosmosEndpoint
    COSMOS_KEY: cosmosKey
    COSMOS_DATABASE: cosmosDatabase
    BLOB_STORAGE_CONNECTION_STRING: blobConnectionString
  }, aiSettings, authSettings, realtimeSettings)
}

output swaDefaultHostname string = swa.properties.defaultHostname

