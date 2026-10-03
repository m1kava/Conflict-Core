using System;
using System.IO;
using ConflictCore.GameData;
using ConflictCore.GameData.Loading;
using ConflictCore.Server.Hosting;
using ConflictCore.Server.Simulation;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;

namespace ConflictCore.Server;

/// <summary>Dedicated match server entry point. One process hosts one match and exits when it ends.</summary>
public static class Program
{
    public static int Main(string[] args)
    {
        HostApplicationBuilder builder = Host.CreateApplicationBuilder(args);

        builder.Services
            .AddOptions<MatchServerOptions>()
            .Bind(builder.Configuration.GetSection(MatchServerOptions.SectionName))
            .ValidateDataAnnotations()
            .ValidateOnStart();

        builder.Services.AddSingleton(provider => LoadGameData(provider.GetRequiredService<IOptions<MatchServerOptions>>().Value));
        builder.Services.AddSingleton<IMatchSimulation, EmptyMatchSimulation>();
        builder.Services.AddHostedService<MatchHostService>();

        using IHost host = builder.Build();

        // Resolve eagerly so invalid data aborts start-up with a clear error instead of failing mid-match.
        host.Services.GetRequiredService<GameDatabase>();
        host.Run();
        return 0;
    }

    private static GameDatabase LoadGameData(MatchServerOptions options)
    {
        if (!Directory.Exists(options.DataDirectory))
        {
            throw new InvalidOperationException($"Game data directory '{Path.GetFullPath(options.DataDirectory)}' does not exist.");
        }

        GameDataLoadResult result = GameDataLoader.Load(GameDataSource.FromDirectory(options.DataDirectory));
        if (!result.Succeeded)
        {
            string details = string.Join(Environment.NewLine, result.Issues);
            throw new InvalidOperationException($"Game data in '{options.DataDirectory}' is invalid:{Environment.NewLine}{details}");
        }

        return result.Database!;
    }
}
