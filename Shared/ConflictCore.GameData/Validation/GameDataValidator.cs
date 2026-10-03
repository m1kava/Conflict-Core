using System;
using System.Collections.Generic;
using ConflictCore.Core.Numerics;
using ConflictCore.GameData.Definitions;
using ConflictCore.GameData.Loading;

namespace ConflictCore.GameData.Validation
{
    /// <summary>
    /// Cross-file consistency checks for game data: unique ids, resolvable references, sane numeric ranges and
    /// a complete damage/armor matrix. Runs in CI (tools/DataValidator) and at server/client start-up.
    /// </summary>
    public static class GameDataValidator
    {
        /// <summary>Authoring limit that keeps every product/quotient far inside <see cref="Fixed"/>'s safe range.</summary>
        private static readonly Fixed MaxMagnitude = Fixed.FromInt(1_000_000);

        public static List<ValidationIssue> Validate(GameDataDocument data)
        {
            var issues = new List<ValidationIssue>();

            HashSet<string> factions = CollectIds(data.Factions, f => f.Id, "factions", issues);
            HashSet<string> damageTypes = CollectIds(data.DamageTypes, d => d.Id, "damageTypes", issues);
            HashSet<string> armorTypes = CollectIds(data.ArmorTypes, a => a.Id, "armorTypes", issues);
            HashSet<string> weapons = CollectIds(data.Weapons, w => w.Id, "weapons", issues);
            CollectIds(data.Units, u => u.Id, "units", issues);
            CollectIds(data.VeterancyLevels, v => v.Id, "veterancyLevels", issues);

            ValidateArmorMatrix(data, damageTypes, armorTypes, issues);

            foreach (WeaponDefinition weapon in data.Weapons)
            {
                ValidateWeapon(weapon, damageTypes, issues);
            }

            foreach (UnitDefinition unit in data.Units)
            {
                ValidateUnit(unit, factions, armorTypes, weapons, issues);
            }

            ValidateVeterancy(data.VeterancyLevels, issues);
            return issues;
        }

        private static HashSet<string> CollectIds<T>(List<T> items, Func<T, string> id, string section, List<ValidationIssue> issues)
        {
            var ids = new HashSet<string>(StringComparer.Ordinal);
            for (int i = 0; i < items.Count; i++)
            {
                string value = id(items[i]);
                string location = $"{section}[{i}]";
                if (!IsValidId(value))
                {
                    issues.Add(new ValidationIssue(location, $"Id '{value}' must be non-empty lower_snake_case."));
                }
                else if (!ids.Add(value))
                {
                    issues.Add(new ValidationIssue(location, $"Duplicate id '{value}'."));
                }
            }

            return ids;
        }

        private static void ValidateArmorMatrix(
            GameDataDocument data, HashSet<string> damageTypes, HashSet<string> armorTypes, List<ValidationIssue> issues)
        {
            var seen = new HashSet<string>(StringComparer.Ordinal);
            for (int i = 0; i < data.ArmorModifiers.Count; i++)
            {
                ArmorModifierDefinition modifier = data.ArmorModifiers[i];
                string location = $"armorModifiers[{i}]";
                RequireReference(damageTypes, modifier.DamageType, "damage type", location, issues);
                RequireReference(armorTypes, modifier.ArmorType, "armor type", location, issues);
                RequireRange(modifier.Multiplier, Fixed.Zero, Fixed.FromInt(10), "multiplier", location, issues);
                if (!seen.Add(modifier.DamageType + "|" + modifier.ArmorType))
                {
                    issues.Add(new ValidationIssue(location, $"Duplicate modifier {modifier.DamageType} vs {modifier.ArmorType}."));
                }
            }

            foreach (string damage in damageTypes)
            {
                foreach (string armor in armorTypes)
                {
                    if (!seen.Contains(damage + "|" + armor))
                    {
                        issues.Add(new ValidationIssue("armorModifiers", $"Missing modifier {damage} vs {armor}."));
                    }
                }
            }
        }

        private static void ValidateWeapon(WeaponDefinition weapon, HashSet<string> damageTypes, List<ValidationIssue> issues)
        {
            string location = $"weapons/{weapon.Id}";
            RequireReference(damageTypes, weapon.DamageType, "damage type", location, issues);
            RequirePositive(weapon.Damage, "damage", location, issues);
            RequirePositive(weapon.Range, "range", location, issues);
            RequireRange(weapon.MinRange, Fixed.Zero, weapon.Range, "minRange", location, issues);
            RequirePositive(weapon.ReloadTime, "reloadTime", location, issues);
            RequireRange(weapon.Accuracy, Fixed.Zero, Fixed.One, "accuracy", location, issues);
            RequireRange(weapon.SplashRadius, Fixed.Zero, MaxMagnitude, "splashRadius", location, issues);
            RequireRange(weapon.SplashEdgeFactor, Fixed.Zero, Fixed.One, "splashEdgeFactor", location, issues);
            RequireRange(weapon.Suppression, Fixed.Zero, Fixed.One, "suppression", location, issues);

            if (weapon.BurstCount < 1)
            {
                issues.Add(new ValidationIssue(location, "burstCount must be at least 1."));
            }
            else if (weapon.BurstCount > 1)
            {
                RequirePositive(weapon.BurstInterval, "burstInterval", location, issues);
            }

            if (weapon.Delivery != WeaponDelivery.Hitscan)
            {
                RequirePositive(weapon.ProjectileSpeed, "projectileSpeed", location, issues);
            }

            if (weapon.Delivery == WeaponDelivery.Missile)
            {
                RequirePositive(weapon.MissileTurnRate, "missileTurnRate", location, issues);
            }

            if (weapon.Targets.Count == 0)
            {
                issues.Add(new ValidationIssue(location, "Weapon must list at least one target layer."));
            }
        }

        private static void ValidateUnit(
            UnitDefinition unit,
            HashSet<string> factions,
            HashSet<string> armorTypes,
            HashSet<string> weapons,
            List<ValidationIssue> issues)
        {
            string location = $"units/{unit.Id}";
            RequireReference(factions, unit.Faction, "faction", location, issues);
            RequireReference(armorTypes, unit.ArmorType, "armor type", location, issues);
            RequirePositive(unit.Health, "health", location, issues);
            RequirePositive(unit.VisionRadius, "visionRadius", location, issues);
            RequireRange(unit.DetectionRadius, Fixed.Zero, MaxMagnitude, "detectionRadius", location, issues);
            RequirePositive(unit.BuildTime, "buildTime", location, issues);
            RequireRange(unit.ExperienceValue, Fixed.Zero, Fixed.FromInt(100), "experienceValue", location, issues);
            RequirePositive(unit.Movement.Speed, "movement.speed", location, issues);
            RequirePositive(unit.Movement.Acceleration, "movement.acceleration", location, issues);
            RequirePositive(unit.Movement.TurnRate, "movement.turnRate", location, issues);
            RequirePositive(unit.Movement.Radius, "movement.radius", location, issues);

            if (unit.Cost < 0)
            {
                issues.Add(new ValidationIssue(location, "cost must not be negative."));
            }

            if (string.IsNullOrEmpty(unit.DisplayNameKey))
            {
                issues.Add(new ValidationIssue(location, "displayNameKey is required."));
            }

            for (int i = 0; i < unit.Weapons.Count; i++)
            {
                WeaponMountDefinition mount = unit.Weapons[i];
                string mountLocation = $"{location}.weapons[{i}]";
                RequireReference(weapons, mount.Weapon, "weapon", mountLocation, issues);
                if (mount.Turreted)
                {
                    RequirePositive(mount.TurretTurnRate, "turretTurnRate", mountLocation, issues);
                }
            }
        }

        private static void ValidateVeterancy(List<VeterancyLevelDefinition> levels, List<ValidationIssue> issues)
        {
            if (levels.Count == 0)
            {
                issues.Add(new ValidationIssue("veterancyLevels", "At least one veterancy level is required."));
                return;
            }

            if (levels[0].ExperienceRequired != Fixed.Zero)
            {
                issues.Add(new ValidationIssue("veterancyLevels[0]", "The first level must require 0 experience."));
            }

            for (int i = 0; i < levels.Count; i++)
            {
                VeterancyLevelDefinition level = levels[i];
                string location = $"veterancyLevels/{level.Id}";
                if (i > 0 && level.ExperienceRequired <= levels[i - 1].ExperienceRequired)
                {
                    issues.Add(new ValidationIssue(location, "experienceRequired must increase with each level."));
                }

                RequirePositive(level.DamageMultiplier, "damageMultiplier", location, issues);
                RequirePositive(level.ReloadMultiplier, "reloadMultiplier", location, issues);
                RequirePositive(level.AccuracyMultiplier, "accuracyMultiplier", location, issues);
                RequirePositive(level.HealthMultiplier, "healthMultiplier", location, issues);
                RequirePositive(level.SpeedMultiplier, "speedMultiplier", location, issues);
                RequireRange(level.RegenerationPerSecond, Fixed.Zero, Fixed.One, "regenerationPerSecond", location, issues);
            }
        }

        private static void RequireReference(HashSet<string> ids, string reference, string kind, string location, List<ValidationIssue> issues)
        {
            if (!ids.Contains(reference))
            {
                issues.Add(new ValidationIssue(location, $"Unknown {kind} '{reference}'."));
            }
        }

        private static void RequirePositive(Fixed value, string field, string location, List<ValidationIssue> issues)
        {
            if (value <= Fixed.Zero || value > MaxMagnitude)
            {
                issues.Add(new ValidationIssue(location, $"{field} must be in (0, {MaxMagnitude}] but is {value}."));
            }
        }

        private static void RequireRange(Fixed value, Fixed min, Fixed max, string field, string location, List<ValidationIssue> issues)
        {
            if (value < min || value > max)
            {
                issues.Add(new ValidationIssue(location, $"{field} must be in [{min}, {max}] but is {value}."));
            }
        }

        private static bool IsValidId(string id)
        {
            if (string.IsNullOrEmpty(id) || id[0] < 'a' || id[0] > 'z')
            {
                return false;
            }

            foreach (char c in id)
            {
                bool allowed = (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_';
                if (!allowed)
                {
                    return false;
                }
            }

            return true;
        }
    }
}
