param swaName string
param swaLocation string
param repositoryUrl string
param repositoryBranch string
param cosmosEndpoint string
param cosmosKey string {
  secure: true
}
param cosmosDatabase string

resource swa 'Microsoft.Web/staticSites@2023-01-01' = {
  name: swaName
  location: swaLocation
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

resource appSettings 'Microsoft.Web/staticSites/config@2023-01-01' = {
  parent: swa
  name: 'appsettings'
  properties: {
    COSMOS_ENDPOINT: cosmosEndpoint
    COSMOS_KEY: cosmosKey
    COSMOS_DATABASE: cosmosDatabase
  }
}

output swaDefaultHostname string = swa.properties.defaultHostname
output swaDeploymentToken string = listSecrets(swa.id, swa.apiVersion).properties.apiKey {
  secure: true
}