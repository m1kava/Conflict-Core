# Dedicated match server image. Build from the repository root:
#   docker build -f Server/Dockerfile -t conflictcore/match-server:dev .
# One container hosts one match; it is disposable and keeps no persistent state.

FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Restore first for better layer caching.
COPY global.json Directory.Build.props Directory.Packages.props .editorconfig ./
COPY Shared/Directory.Build.props Shared/.editorconfig Shared/
COPY Shared/ConflictCore.Core/ConflictCore.Core.csproj Shared/ConflictCore.Core/packages.lock.json Shared/ConflictCore.Core/
COPY Shared/ConflictCore.Protocol/ConflictCore.Protocol.csproj Shared/ConflictCore.Protocol/packages.lock.json Shared/ConflictCore.Protocol/
COPY Shared/ConflictCore.GameData/ConflictCore.GameData.csproj Shared/ConflictCore.GameData/packages.lock.json Shared/ConflictCore.GameData/
COPY Server/ConflictCore.Server/ConflictCore.Server.csproj Server/ConflictCore.Server/packages.lock.json Server/ConflictCore.Server/
RUN dotnet restore Server/ConflictCore.Server/ConflictCore.Server.csproj --locked-mode

COPY Shared/ Shared/
COPY Server/ConflictCore.Server/ Server/ConflictCore.Server/
ARG VERSION=0.1.0
RUN dotnet publish Server/ConflictCore.Server/ConflictCore.Server.csproj \
      -c Release --no-restore -o /app /p:Version=${VERSION}

FROM mcr.microsoft.com/dotnet/runtime:8.0 AS runtime
WORKDIR /app
COPY --from=build /app ./
COPY Data/ ./Data/

ENV DOTNET_TieredPGO=1 \
    MatchServer__DataDirectory=/app/Data
EXPOSE 7777/udp
USER app
ENTRYPOINT ["dotnet", "ConflictCore.Server.dll"]
