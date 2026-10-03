using ConflictCore.Client.CameraControl;
using ConflictCore.Client.Gestures;
using ConflictCore.Client.Logic.Quality;
using ConflictCore.Client.Quality;
using ConflictCore.Client.World;
using UnityEngine;

namespace ConflictCore.Client.Bootstrap
{
    /// <summary>
    /// Entry point of the Bootstrap scene. Phase 1 scope: apply the device quality preset, then assemble the
    /// sandbox (placeholder terrain, sun, touch input, RTS camera) used to validate controls and budgets.
    /// Later phases replace the sandbox with the front-end flow (login → menu → lobby → match loading).
    /// </summary>
    public sealed class GameBootstrap : MonoBehaviour
    {
        [SerializeField]
        [Tooltip("Side length of the sandbox terrain in metres.")]
        private float _sandboxMapSize = 512f;

        [SerializeField]
        private int _sandboxSeed = 1337;

        private void Start()
        {
            Screen.sleepTimeout = SleepTimeout.NeverSleep;

            QualityTier tier = QualityPresetApplier.DetectDefaultTier();
            QualityPresetApplier.Apply(QualityProfiles.Get(tier));
            Debug.Log($"Conflict Core {Application.version}: quality tier {tier} on {SystemInfo.deviceModel}.");

            BuildSandbox();
        }

        private void BuildSandbox()
        {
            PlaceholderTerrainBuilder.Build(_sandboxMapSize, _sandboxSeed);
            CreateSun();

            var inputObject = new GameObject("Gesture Input");
            GestureInputRouter input = inputObject.AddComponent<GestureInputRouter>();

            var cameraObject = new GameObject("RTS Camera");
            Camera camera = cameraObject.AddComponent<Camera>();
            camera.nearClipPlane = 1f;
            camera.farClipPlane = 900f;
            cameraObject.tag = "MainCamera";

            RtsCameraRig rig = cameraObject.AddComponent<RtsCameraRig>();
            float margin = _sandboxMapSize * 0.05f;
            rig.Initialize(
                input,
                new Vector2(margin, margin),
                new Vector2(_sandboxMapSize - margin, _sandboxMapSize - margin),
                new Vector2(_sandboxMapSize * 0.2f, _sandboxMapSize * 0.2f));
        }

        private static void CreateSun()
        {
            var sunObject = new GameObject("Sun");
            Light sun = sunObject.AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.intensity = 1.2f;
            sun.color = new Color(1f, 0.96f, 0.88f);
            sun.shadows = LightShadows.Soft;
            sunObject.transform.rotation = Quaternion.Euler(50f, -35f, 0f);
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(0.55f, 0.62f, 0.72f);
            RenderSettings.ambientEquatorColor = new Color(0.42f, 0.42f, 0.40f);
            RenderSettings.ambientGroundColor = new Color(0.22f, 0.20f, 0.18f);
        }
    }
}
