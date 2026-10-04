param swaName string
param swaLocation string
param repositoryUrl string
param repositoryBranch string
param cosmosEndpoint string
@secure()
param cosmosKey string
param cosmosDatabase string
@secure()
param authSessionSecret string

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

// Only deploy app settings when cosmosKey is provided.
// Deploying with an empty key would silently overwrite a previously correct key.
resource appSettings 'Microsoft.Web/staticSites/config@2023-01-01' = if (!empty(cosmosKey)) {
  parent: swa
  name: 'appsettings'
  properties: union({
    COSMOS_ENDPOINT: cosmosEndpoint
    COSMOS_KEY: cosmosKey
    COSMOS_DATABASE: cosmosDatabase
  }, empty(authSessionSecret) ? {} : {
    // Signing key for native username/password session cookies.
    AUTH_SESSION_SECRET: authSessionSecret
  })
}

output swaDefaultHostname string = swa.properties.defaultHostname

