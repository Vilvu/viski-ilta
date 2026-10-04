// Storage account for whiskey bottle photos.
// The container is private: photos are only served through the API route
// GET /api/whiskeys/{id}/image, which reads them with the account key.

param storageAccountName string
param location string
param environment string

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  tags: {
    Environment: environment
  }
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storageAccount
  name: 'default'
}

resource imagesContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'whiskey-images'
  properties: {
    publicAccess: 'None'
  }
}

output storageAccountName string = storageAccount.name
