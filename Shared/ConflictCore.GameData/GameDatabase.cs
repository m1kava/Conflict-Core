using System;
using System.Collections.Generic;
using ConflictCore.Core.Numerics;
using ConflictCore.GameData.Definitions;
using ConflictCore.GameData.Loading;

namespace ConflictCore.GameData
{
    /// <summary>
    /// Immutable, validated view of all game data. Created only by <see cref="GameDataLoader"/>.
    /// </summary>
    /// <remarks>
    /// Every definition list is sorted by id (ordinal), giving each definition a stable index that is identical
    /// on client and server for the same <see cref="ContentHash"/>. Network commands refer to content by that
    /// index (e.g. "produce unit #3"), never by string.
    /// </remarks>
    public sealed class GameDatabase
    {
        private readonly Dictionary<string, UnitDefinition> _unitsById;
        private readonly Dictionary<string, WeaponDefinition> _weaponsById;
        private readonly Dictionary<string, FactionDefinition> _factionsById;
        private readonly Dictionary<string, Fixed> _armorModifiers;
        private readonly Dictionary<string, int> _unitIndices;

        internal GameDatabase(GameDataDocument data, ulong contentHash)
        {
            ContentHash = contentHash;
            Units = SortedById(data.Units, u => u.Id);
            Weapons = SortedById(data.Weapons, w => w.Id);
            Factions = SortedById(data.Factions, f => f.Id);
            VeterancyLevels = data.VeterancyLevels.ToArray();

            _unitsById = ToDictionary(Units, u => u.Id);
            _weaponsById = ToDictionary(Weapons, w => w.Id);
            _factionsById = ToDictionary(Factions, f => f.Id);
            _unitIndices = new Dictionary<string, int>(Units.Count, StringComparer.Ordinal);
            for (int i = 0; i < Units.Count; i++)
            {
                _unitIndices.Add(Units[i].Id, i);
            }

            _armorModifiers = new Dictionary<string, Fixed>(StringComparer.Ordinal);
            foreach (ArmorModifierDefinition modifier in data.ArmorModifiers)
            {
                _armorModifiers[ModifierKey(modifier.DamageType, modifier.ArmorType)] = modifier.Multiplier;
            }
        }

        /// <summary>Hash of the source data; compared during the client/server handshake.</summary>
        public ulong ContentHash { get; }

        public IReadOnlyList<UnitDefinition> Units { get; }

        public IReadOnlyList<WeaponDefinition> Weapons { get; }

        public IReadOnlyList<FactionDefinition> Factions { get; }

        /// <summary>Veterancy ranks in ascending order of required experience.</summary>
        public IReadOnlyList<VeterancyLevelDefinition> VeterancyLevels { get; }

        public UnitDefinition GetUnit(string id) => Get(_unitsById, id, "unit");

        public WeaponDefinition GetWeapon(string id) => Get(_weaponsById, id, "weapon");

        public FactionDefinition GetFaction(string id) => Get(_factionsById, id, "faction");

        public bool TryGetUnit(string id, out UnitDefinition unit) => _unitsById.TryGetValue(id, out unit!);

        /// <summary>Damage multiplier for a damage type hitting an armor type. The matrix is complete by validation.</summary>
        public Fixed GetArmorModifier(string damageType, string armorType) =>
            _armorModifiers[ModifierKey(damageType, armorType)];

        /// <summary>Stable network index of a unit definition, or -1 if unknown.</summary>
        public int IndexOfUnit(string id) => _unitIndices.TryGetValue(id, out int index) ? index : -1;

        private static string ModifierKey(string damageType, string armorType) => damageType + "|" + armorType;

        private static T[] SortedById<T>(List<T> items, Func<T, string> id)
        {
            T[] sorted = items.ToArray();
            Array.Sort(sorted, (a, b) => string.CompareOrdinal(id(a), id(b)));
            return sorted;
        }

        private static Dictionary<string, T> ToDictionary<T>(IReadOnlyList<T> items, Func<T, string> id)
        {
            var dictionary = new Dictionary<string, T>(items.Count, StringComparer.Ordinal);
            foreach (T item in items)
            {
                dictionary.Add(id(item), item);
            }

            return dictionary;
        }

        private static T Get<T>(Dictionary<string, T> items, string id, string kind)
        {
            if (!items.TryGetValue(id, out T? value))
            {
                throw new KeyNotFoundException($"Unknown {kind} '{id}'.");
            }

            return value;
        }
    }
}
