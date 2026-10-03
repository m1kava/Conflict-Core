using System;
using System.Globalization;
using ConflictCore.Core.Numerics;
using Newtonsoft.Json;

namespace ConflictCore.GameData.Loading
{
    /// <summary>
    /// Reads JSON numbers into <see cref="Fixed"/> through <see cref="decimal"/>, never through
    /// <c>double</c>, so authored balance values map to identical raw values on every platform.
    /// </summary>
    public sealed class FixedJsonConverter : JsonConverter<Fixed>
    {
        public override Fixed ReadJson(JsonReader reader, Type objectType, Fixed existingValue, bool hasExistingValue, JsonSerializer serializer)
        {
            switch (reader.TokenType)
            {
                case JsonToken.Integer:
                    return Fixed.FromDecimal(Convert.ToDecimal(reader.Value, CultureInfo.InvariantCulture));
                case JsonToken.Float when reader.Value is decimal value:
                    return Fixed.FromDecimal(value);
                default:
                    throw new JsonSerializationException(
                        $"Expected a number for a fixed-point value but found {reader.TokenType}. " +
                        "Enable FloatParseHandling.Decimal when reading game data.");
            }
        }

        public override void WriteJson(JsonWriter writer, Fixed value, JsonSerializer serializer) =>
            writer.WriteValue(value.ToDecimal());
    }
}
