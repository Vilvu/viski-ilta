using '../main.bicep'

param location = 'northeurope'
param resourceGroupName = 'rg-whiskyapp'
param cosmosAccountName = 'cosmos-whiskyapp-prod'  // Must be globally unique
param swaName = 'swa-whiskyapp-prod'
param repositoryUrl = 'https://github.com/YOUR_USERNAME/WhiskyApp'  // TODO: Update with actual repo URL
param cosmosKey = null  // Must be provided at deployment time via --parameters cosmosKey=$COSMOS_KEY
param environment = 'prod'