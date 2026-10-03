using System.Collections.Generic;
using ConflictCore.GameData.Definitions;

namespace ConflictCore.GameData.Loading
{
    /// <summary>
    /// Shape of one JSON data file. A file may contain any subset of sections; the loader merges all files,
    /// so content can be split by faction or category without code changes.
    /// </summary>
    public sealed class GameDataDocument
    {
        public List<FactionDefinition> Factions { get; set; } = new List<FactionDefinition>();

        public List<DamageTypeDefinition> DamageTypes { get; set; } = new List<DamageTypeDefinition>();

        public List<ArmorTypeDefinition> ArmorTypes { get; set; } = new List<ArmorTypeDefinition>();

        public List<ArmorModifierDefinition> ArmorModifiers { get; set; } = new List<ArmorModifierDefinition>();

        public List<WeaponDefinition> Weapons { get; set; } = new List<WeaponDefinition>();

        public List<UnitDefinition> Units { get; set; } = new List<UnitDefinition>();

        public List<VeterancyLevelDefinition> VeterancyLevels { get; set; } = new List<VeterancyLevelDefinition>();

        /// <summary>Appends every section of <paramref name="other"/> to this document.</summary>
        public void MergeFrom(GameDataDocument other)
        {
            Factions.AddRange(other.Factions);
            DamageTypes.AddRange(other.DamageTypes);
            ArmorTypes.AddRange(other.ArmorTypes);
            ArmorModifiers.AddRange(other.ArmorModifiers);
            Weapons.AddRange(other.Weapons);
            Units.AddRange(other.Units);
            VeterancyLevels.AddRange(other.VeterancyLevels);
        }
    }
}
