targetScope = 'subscription'

param location string = 'westeurope'
param resourceGroupName string
param cosmosAccountName string
param swaName string
@minLength(3)
@maxLength(24)
param storageAccountName string  // lowercase letters and digits, globally unique
param swaLocation string = 'westeurope'  // SWA has limited regions, westeurope is a valid one
param repositoryUrl string
param repositoryBranch string
@secure()
param cosmosKey string = ''
@secure()
param authSessionSecret string = ''
@secure()
param anthropicApiKey string = ''  // optional; enables AI bottle recognition
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

module storageModule './modules/storage.bicep' = {
  name: 'storageModule'
  scope: resourceGroup(resourceGroupName)
  params: {
    storageAccountName: storageAccountName
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
    storageAccountName: storageModule.outputs.storageAccountName
    anthropicApiKey: anthropicApiKey
    authSessionSecret: authSessionSecret
  }
  dependsOn: [
    rg
  ]
}

output cosmosEndpoint string = cosmosDbModule.outputs.cosmosEndpoint
output cosmosAccountName string = cosmosDbModule.outputs.cosmosAccountName
output storageAccountName string = storageModule.outputs.storageAccountName
output swaDefaultHostname string = staticWebAppModule.outputs.swaDefaultHostname

