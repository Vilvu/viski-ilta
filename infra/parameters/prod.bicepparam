using '../main.bicep'

param location = 'northeurope'
param resourceGroupName = 'rg-whiskyapp-prd'
param cosmosAccountName = 'cosmos-whiskyapp-123-prod'  // Must be globally unique
param swaName = 'swa-whiskyapp-prod'
param repositoryUrl = 'https://github.com/YOUR_USERNAME/WhiskyApp'  // TODO: Update with actual repo URL
param environment = 'prod'
