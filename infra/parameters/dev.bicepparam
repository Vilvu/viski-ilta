using '../main.bicep'

param location = 'northeurope'
param resourceGroupName = 'rg-whiskyapp-dev'
param cosmosAccountName = 'cosmos-whiskyapp-123-dev'  // Must be globally unique
param signalrName = 'signalr-whiskyapp-123-dev'  // Must be globally unique
param swaName = 'swa-whiskyapp-dev'
param storageAccountName = 'stwhiskyapp123dev'  // Must be globally unique, 3-24 lowercase letters/digits
param repositoryUrl = 'https://github.com/Vilvu/viski-ilta'
param repositoryBranch = 'dev'
param environment = 'dev'
