using '../main.bicep'

param location = 'westeurope'
param swaLocation = 'westeurope'
param resourceGroupName = 'rg-whiskyapp-prd'
param cosmosAccountName = 'cosmos-whiskyapp-123-prod'
param signalrName = 'signalr-whiskyapp-123-prod'  // Must be globally unique
param swaName = 'swa-whiskyapp-prod'
param storageAccountName = 'stwhiskyapp123prod'  // Must be globally unique, 3-24 lowercase letters/digits
param repositoryUrl = 'https://github.com/Vilvu/viski-ilta'
param repositoryBranch = 'main'
param environment = 'prod'

