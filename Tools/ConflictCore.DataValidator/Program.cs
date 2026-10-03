using System;
using System.Collections.Generic;
using System.IO;
using ConflictCore.GameData;
using ConflictCore.GameData.Loading;
using ConflictCore.GameData.Validation;

namespace ConflictCore.DataValidator;

/// <summary>
/// CI entry point: loads and validates the game data folder, prints a summary and the content hash, and exits
/// non-zero on any problem. Usage: <c>ConflictCore.DataValidator [data-directory]</c>.
/// </summary>
public static class Program
{
    private const int ExitOk = 0;
    private const int ExitInvalidData = 1;
    private const int ExitUsage = 2;

    public static int Main(string[] args)
    {
        string dataDirectory = args.Length > 0 ? args[0] : "Data";
        if (!Directory.Exists(dataDirectory))
        {
            Console.Error.WriteLine($"Data directory '{dataDirectory}' does not exist.");
            return ExitUsage;
        }

        List<GameDataSource> sources = GameDataSource.FromDirectory(dataDirectory);
        GameDataLoadResult result = GameDataLoader.Load(sources);

        if (!result.Succeeded)
        {
            foreach (ValidationIssue issue in result.Issues)
            {
                // GitHub Actions annotation format surfaces each problem inline on the pull request.
                Console.WriteLine($"::error title=Game data::{issue}");
            }

            Console.Error.WriteLine($"Game data invalid: {result.Issues.Count} issue(s).");
            return ExitInvalidData;
        }

        GameDatabase database = result.Database!;
        Console.WriteLine($"Game data OK: {sources.Count} files, {database.Factions.Count} factions, " +
            $"{database.Units.Count} units, {database.Weapons.Count} weapons, {database.VeterancyLevels.Count} veterancy levels.");
        Console.WriteLine($"Content hash: {database.ContentHash:X16}");
        return ExitOk;
    }
}
