targetScope = 'subscription'

param location string = 'northeurope'
param resourceGroupName string
param cosmosAccountName string
param swaName string
param swaLocation string = 'westeurope'  // SWA has limited regions, westeurope is a valid one
param repositoryUrl string
param repositoryBranch string = 'main'
@secure()
param cosmosKey string = ''
param environment string

resource rg 'Microsoft.Resources/resourceGroups@2021-04-01' = {
  name: resourceGroupName
  location: location
  tags: {
    Environment: environment
  }
}

module cosmosDbModule './modules/cosmosdb.bicep' = {
  name: 'cosmosDbModule'
  scope: resourceGroup(resourceGroupName)
  params: {
    cosmosAccountName: cosmosAccountName
    location: location
    environment: environment
  }
  dependsOn: [
    rg
  ]
}

module staticWebAppModule './modules/staticwebapp.bicep' = {
  name: 'staticWebAppModule'
  scope: resourceGroup(resourceGroupName)
  params: {
    swaName: swaName
    swaLocation: swaLocation
    repositoryUrl: repositoryUrl
    repositoryBranch: repositoryBranch
    cosmosEndpoint: cosmosDbModule.outputs.cosmosEndpoint
    cosmosKey: cosmosKey
    cosmosDatabase: 'whiskyapp'
  }
  dependsOn: [
    rg
  ]
}

output cosmosEndpoint string = cosmosDbModule.outputs.cosmosEndpoint
output cosmosAccountName string = cosmosDbModule.outputs.cosmosAccountName
output swaDefaultHostname string = staticWebAppModule.outputs.swaDefaultHostname
output swaDeploymentToken string = staticWebAppModule.outputs.swaDeploymentToken