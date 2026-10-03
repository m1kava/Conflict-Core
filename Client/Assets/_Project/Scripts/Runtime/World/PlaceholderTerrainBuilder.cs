using UnityEngine;

namespace ConflictCore.Client.World
{
    /// <summary>
    /// PLACEHOLDER (Phase 1): generates a rolling test terrain at runtime so camera, input and rendering budgets
    /// can be exercised before authored maps exist. It is visual only — the server does not know about it.
    /// Replaced in Phase 2/5 by terrain built from map data (heightmap + splat maps + navigation data) that the
    /// server and client share, and in Phase 7 by production terrain materials.
    /// </summary>
    public static class PlaceholderTerrainBuilder
    {
        private const int HeightmapResolution = 257;
        private const int AlphamapResolution = 256;
        private const float MaxHeight = 24f;

        private static readonly Color GrassColor = new Color(0.31f, 0.38f, 0.22f);
        private static readonly Color DirtColor = new Color(0.42f, 0.35f, 0.26f);
        private static readonly Color RockColor = new Color(0.45f, 0.44f, 0.42f);

        /// <summary>Builds a square terrain of <paramref name="size"/> metres with its corner at the origin.</summary>
        public static Terrain Build(float size, int seed)
        {
            var data = new TerrainData
            {
                heightmapResolution = HeightmapResolution,
                alphamapResolution = AlphamapResolution,
            };
            data.size = new Vector3(size, MaxHeight, size);
            data.SetHeights(0, 0, GenerateHeights(seed));
            data.terrainLayers = new[]
            {
                CreateLayer("Placeholder Grass", GrassColor),
                CreateLayer("Placeholder Dirt", DirtColor),
                CreateLayer("Placeholder Rock", RockColor),
            };
            data.SetAlphamaps(0, 0, GenerateSplat(data));

            GameObject terrainObject = Terrain.CreateTerrainGameObject(data);
            terrainObject.name = "Terrain (PLACEHOLDER)";
            Terrain terrain = terrainObject.GetComponent<Terrain>();
            terrain.heightmapPixelError = 8f;
            terrain.basemapDistance = size;
            terrain.drawInstanced = true;
            return terrain;
        }

        private static float[,] GenerateHeights(int seed)
        {
            var heights = new float[HeightmapResolution, HeightmapResolution];
            var random = new System.Random(seed);
            float offsetX = random.Next(0, 10_000);
            float offsetY = random.Next(0, 10_000);

            for (int y = 0; y < HeightmapResolution; y++)
            {
                for (int x = 0; x < HeightmapResolution; x++)
                {
                    float u = x / (float)(HeightmapResolution - 1);
                    float v = y / (float)(HeightmapResolution - 1);

                    float broad = Mathf.PerlinNoise(offsetX + (u * 3f), offsetY + (v * 3f));
                    float detail = Mathf.PerlinNoise(offsetX + (u * 12f), offsetY + (v * 12f)) * 0.15f;
                    float height = (broad * 0.55f) + detail;

                    // Flat build plateaus in two opposite corners, like spawn areas on a 1v1 map.
                    height = Flatten(height, u, v, 0.2f, 0.2f, 0.12f, 0.35f);
                    height = Flatten(height, u, v, 0.8f, 0.8f, 0.12f, 0.35f);

                    // Valley along the diagonal so there are natural approach routes.
                    float distanceToDiagonal = Mathf.Abs(u - v) / Mathf.Sqrt(2f);
                    height *= Mathf.Lerp(0.55f, 1f, Mathf.Clamp01(distanceToDiagonal / 0.2f));

                    heights[y, x] = Mathf.Clamp01(height);
                }
            }

            return heights;
        }

        private static float Flatten(float height, float u, float v, float centerU, float centerV, float radius, float plateauHeight)
        {
            float distance = Vector2.Distance(new Vector2(u, v), new Vector2(centerU, centerV));
            float blend = Mathf.SmoothStep(0f, 1f, Mathf.Clamp01((distance - radius) / radius));
            return Mathf.Lerp(plateauHeight, height, blend);
        }

        private static float[,,] GenerateSplat(TerrainData data)
        {
            var splat = new float[AlphamapResolution, AlphamapResolution, 3];
            for (int y = 0; y < AlphamapResolution; y++)
            {
                for (int x = 0; x < AlphamapResolution; x++)
                {
                    float u = x / (float)(AlphamapResolution - 1);
                    float v = y / (float)(AlphamapResolution - 1);
                    float steepness = data.GetSteepness(u, v);

                    float rock = Mathf.Clamp01((steepness - 18f) / 12f);
                    float dirt = (1f - rock) * Mathf.Clamp01(1f - (Mathf.Abs(u - v) / 0.08f));
                    float grass = Mathf.Max(0f, 1f - rock - dirt);

                    splat[y, x, 0] = grass;
                    splat[y, x, 1] = dirt;
                    splat[y, x, 2] = rock;
                }
            }

            return splat;
        }

        private static TerrainLayer CreateLayer(string name, Color color)
        {
            var texture = new Texture2D(4, 4, TextureFormat.RGBA32, mipChain: true) { name = name + " Texture" };
            var pixels = new Color[16];
            for (int i = 0; i < pixels.Length; i++)
            {
                pixels[i] = color;
            }

            texture.SetPixels(pixels);
            texture.Apply(updateMipmaps: true, makeNoLongerReadable: true);

            return new TerrainLayer { name = name, diffuseTexture = texture, tileSize = new Vector2(8f, 8f) };
        }
    }
}
