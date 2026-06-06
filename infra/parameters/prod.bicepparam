using '../main.bicep'

param location = 'northeurope'
param resourceGroupName = 'rg-whiskyapp-prd'
param cosmosAccountName = 'cosmos-whiskyapp-123-prod'  // Must be globally unique
param swaName = 'swa-whiskyapp-prod'
param repositoryUrl = 'https://github.com/Vilvu/viski-ilta'  // TODO: Update with actual repo URL
param repositoryBranch = 'main'
param environment = 'prod'

