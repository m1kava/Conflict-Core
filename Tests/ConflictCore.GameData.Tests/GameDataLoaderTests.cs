using System.Collections.Generic;
using System.IO;
using System.Linq;
using ConflictCore.Core.Numerics;
using ConflictCore.GameData.Definitions;
using ConflictCore.GameData.Loading;

namespace ConflictCore.GameData.Tests;

public class GameDataLoaderTests
{
    private const string CombatCore = """
        {
          "damageTypes": [ { "id": "kinetic" } ],
          "armorTypes": [ { "id": "plate" } ],
          "armorModifiers": [ { "damageType": "kinetic", "armorType": "plate", "multiplier": 0.5 } ],
          "factions": [ { "id": "test", "displayNameKey": "faction.test", "playable": true } ],
          "veterancyLevels": [ { "id": "recruit", "displayNameKey": "vet.recruit", "experienceRequired": 0 } ]
        }
        """;

    private const string ValidUnits = """
        {
          "weapons": [
            { "id": "gun", "delivery": "Hitscan", "damage": 10, "damageType": "kinetic", "range": 30,
              "reloadTime": 1.5, "targets": [ "Ground" ] }
          ],
          "units": [
            { "id": "tank", "faction": "test", "class": "MainBattleTank", "displayNameKey": "unit.tank",
              "health": 500, "armorType": "plate",
              "movement": { "locomotor": "Tracked", "speed": 6.5, "acceleration": 3, "turnRate": 90, "radius": 2.5 },
              "weapons": [ { "weapon": "gun", "turreted": true, "turretTurnRate": 60 } ],
              "visionRadius": 40, "cost": 900, "buildTime": 15 }
          ]
        }
        """;

    [Fact]
    public void AuthoredData_IsValid()
    {
        GameDataLoadResult result = GameDataLoader.Load(GameDataSource.FromDirectory(Path.Combine(System.AppContext.BaseDirectory, "Data")));

        Assert.True(result.Succeeded, string.Join("\n", result.Issues));
        Assert.NotEmpty(result.Database!.Units);
        Assert.Contains(result.Database.Factions, f => f.Playable);
    }

    [Fact]
    public void ValidData_LoadsWithExactFixedPointValues()
    {
        GameDatabase database = LoadValid();
        UnitDefinition tank = database.GetUnit("tank");

        Assert.Equal(Fixed.Parse("6.5"), tank.Movement.Speed);
        Assert.Equal(Locomotor.Tracked, tank.Movement.Locomotor);
        Assert.Equal(Fixed.Parse("0.5"), database.GetArmorModifier("kinetic", "plate"));
        Assert.Equal(Fixed.Parse("1.5"), database.GetWeapon("gun").ReloadTime);
    }

    [Fact]
    public void ContentHash_IsStableAndOrderIndependent()
    {
        ulong first = Load(("a.json", CombatCore), ("b.json", ValidUnits)).Database!.ContentHash;
        ulong reordered = Load(("b.json", ValidUnits), ("a.json", CombatCore)).Database!.ContentHash;
        ulong crlf = Load(("a.json", CombatCore.Replace("\n", "\r\n")), ("b.json", ValidUnits)).Database!.ContentHash;

        Assert.Equal(first, reordered);
        Assert.Equal(first, crlf);
    }

    [Fact]
    public void ContentHash_ChangesWhenBalanceChanges()
    {
        ulong original = LoadValid().ContentHash;
        ulong changed = Load(("a.json", CombatCore), ("b.json", ValidUnits.Replace("\"health\": 500", "\"health\": 501"))).Database!.ContentHash;

        Assert.NotEqual(original, changed);
    }

    [Fact]
    public void UnknownField_IsAnError()
    {
        GameDataLoadResult result = Load(("a.json", CombatCore), ("b.json", ValidUnits.Replace("\"visionRadius\"", "\"visonRadius\"")));

        Assert.False(result.Succeeded);
        Assert.Contains(result.Issues, issue => issue.Location == "b.json");
    }

    [Fact]
    public void NumericEnumValue_IsAnError()
    {
        GameDataLoadResult result = Load(("a.json", CombatCore), ("b.json", ValidUnits.Replace("\"Tracked\"", "2")));

        Assert.False(result.Succeeded);
    }

    [Theory]
    [InlineData("\"weapon\": \"gun\"", "\"weapon\": \"missing_gun\"", "Unknown weapon")]
    [InlineData("\"armorType\": \"plate\",\n", "\"armorType\": \"paper\",\n", "Unknown armor type")]
    [InlineData("\"health\": 500", "\"health\": 0", "health")]
    [InlineData("\"id\": \"tank\"", "\"id\": \"Tank\"", "lower_snake_case")]
    [InlineData("\"range\": 30", "\"range\": 30, \"minRange\": 40", "minRange")]
    public void InvalidUnitData_IsReported(string original, string replacement, string expectedMessage)
    {
        string units = ValidUnits.Replace(original, replacement);
        Assert.NotEqual(ValidUnits, units);

        GameDataLoadResult result = Load(("a.json", CombatCore), ("b.json", units));

        Assert.False(result.Succeeded);
        Assert.Contains(result.Issues, issue => issue.Message.Contains(expectedMessage));
    }

    [Fact]
    public void DuplicateIds_AcrossFiles_AreReported()
    {
        GameDataLoadResult result = Load(("a.json", CombatCore), ("b.json", ValidUnits), ("c.json", ValidUnits));

        Assert.Contains(result.Issues, issue => issue.Message.Contains("Duplicate id 'tank'"));
    }

    [Fact]
    public void IncompleteArmorMatrix_IsReported()
    {
        string core = CombatCore.Replace("[ { \"id\": \"plate\" } ]", "[ { \"id\": \"plate\" }, { \"id\": \"flesh\" } ]");

        GameDataLoadResult result = Load(("a.json", core), ("b.json", ValidUnits));

        Assert.Contains(result.Issues, issue => issue.Message.Contains("Missing modifier kinetic vs flesh"));
    }

    [Fact]
    public void DefinitionIndices_AreSortedById()
    {
        string twoUnits = ValidUnits.Replace("\"units\": [", "\"units\": [ " + ExtractTank().Replace("\"tank\"", "\"apc\"") + ",");
        GameDatabase database = Load(("a.json", CombatCore), ("b.json", twoUnits)).Database!;

        Assert.Equal(new[] { "apc", "tank" }, database.Units.Select(u => u.Id));
        Assert.Equal(1, database.IndexOfUnit("tank"));
        Assert.Equal(-1, database.IndexOfUnit("nope"));
    }

    private static string ExtractTank()
    {
        int start = ValidUnits.IndexOf("{ \"id\": \"tank\"", System.StringComparison.Ordinal);
        int end = ValidUnits.LastIndexOf('}', ValidUnits.LastIndexOf(']'));
        return ValidUnits.Substring(start, end - start + 1);
    }

    private static GameDatabase LoadValid()
    {
        GameDataLoadResult result = Load(("a.json", CombatCore), ("b.json", ValidUnits));
        Assert.True(result.Succeeded, string.Join("\n", result.Issues));
        return result.Database!;
    }

    private static GameDataLoadResult Load(params (string Path, string Content)[] files)
    {
        List<GameDataSource> sources = files.Select(f => new GameDataSource(f.Path, f.Content)).ToList();
        return GameDataLoader.Load(sources);
    }
}
