using '../main.bicep'

param location = 'westeurope'
param swaLocation = 'westeurope'
param resourceGroupName = 'rg-whiskyapp-prd'
param cosmosAccountName = 'cosmos-whiskyapp-123-prod'
param swaName = 'swa-whiskyapp-prod'
param repositoryUrl = 'https://github.com/Vilvu/viski-ilta'
param repositoryBranch = 'main'
param environment = 'prod'

