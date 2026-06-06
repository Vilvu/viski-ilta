using '../main.bicep'

param location = 'northeurope'
param resourceGroupName = 'rg-whiskyapp-dev'
param cosmosAccountName = 'cosmos-whiskyapp-123-dev'  // Must be globally unique
param swaName = 'swa-whiskyapp-dev'
param repositoryUrl = 'https://github.com/Vilvu/viski-ilta'
param repositoryBranch = 'dev'
param environment = 'dev'
