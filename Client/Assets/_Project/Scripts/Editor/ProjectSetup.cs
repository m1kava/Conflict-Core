using ConflictCore.Client.Bootstrap;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;

namespace ConflictCore.Client.Editor
{
    /// <summary>
    /// Creates and enforces project configuration from code: URP pipeline assets, the Bootstrap scene and
    /// Android/iOS player settings. Keeping this in code (instead of hand-edited ProjectSettings) makes the
    /// configuration reviewable in pull requests and reproducible in CI. Idempotent; safe to run repeatedly.
    /// </summary>
    public static class ProjectSetup
    {
        public const string BootstrapScenePath = "Assets/_Project/Scenes/Bootstrap.unity";

        private const string ApplicationIdentifier = "com.conflictcore.game";
        private const string SettingsFolder = "Assets/_Project/Settings";
        private const string PipelineAssetPath = SettingsFolder + "/URP-Mobile.asset";
        private const string RendererAssetPath = SettingsFolder + "/URP-Mobile-Renderer.asset";
        private const int MinimumAndroidApiLevel = 26;
        private const int InputSystemOnly = 1;

        [MenuItem("Conflict Core/Apply Project Setup")]
        public static void Apply()
        {
            EnsureFolder("Assets/_Project", "Settings");
            EnsureFolder("Assets/_Project", "Scenes");
            EnsureRenderPipeline();
            EnsureBootstrapScene();
            ApplyPlayerSettings();
            AssetDatabase.SaveAssets();
            Debug.Log("Conflict Core project setup applied.");
        }

        private static void EnsureRenderPipeline()
        {
            var pipeline = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(PipelineAssetPath);
            if (pipeline == null)
            {
                var renderer = ScriptableObject.CreateInstance<UniversalRendererData>();
                AssetDatabase.CreateAsset(renderer, RendererAssetPath);
                pipeline = UniversalRenderPipelineAsset.Create(renderer);
                AssetDatabase.CreateAsset(pipeline, PipelineAssetPath);
            }

            // Mobile-oriented defaults; runtime presets (QualityProfiles) adjust per device tier.
            pipeline.supportsHDR = false;
            pipeline.msaaSampleCount = 2;
            pipeline.shadowDistance = 140f;
            pipeline.shadowCascadeCount = 2;
            EditorUtility.SetDirty(pipeline);

            GraphicsSettings.defaultRenderPipeline = pipeline;
            int currentLevel = QualitySettings.GetQualityLevel();
            for (int level = 0; level < QualitySettings.names.Length; level++)
            {
                QualitySettings.SetQualityLevel(level, applyExpensiveChanges: false);
                QualitySettings.renderPipeline = pipeline;
            }

            QualitySettings.SetQualityLevel(currentLevel, applyExpensiveChanges: false);
        }

        private static void EnsureBootstrapScene()
        {
            if (AssetDatabase.LoadAssetAtPath<SceneAsset>(BootstrapScenePath) == null)
            {
                Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                new GameObject("Game Bootstrap").AddComponent<GameBootstrap>();
                EditorSceneManager.SaveScene(scene, BootstrapScenePath);
            }

            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(BootstrapScenePath, true) };
        }

        private static void ApplyPlayerSettings()
        {
            PlayerSettings.companyName = "Conflict Core";
            PlayerSettings.productName = "Conflict Core";
            PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.Android, ApplicationIdentifier);
            PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.iOS, ApplicationIdentifier);

            // Landscape only: RTS HUD layout is designed for landscape phones and tablets.
            PlayerSettings.defaultInterfaceOrientation = UIOrientation.AutoRotation;
            PlayerSettings.allowedAutorotateToPortrait = false;
            PlayerSettings.allowedAutorotateToPortraitUpsideDown = false;
            PlayerSettings.allowedAutorotateToLandscapeLeft = true;
            PlayerSettings.allowedAutorotateToLandscapeRight = true;

            PlayerSettings.gcIncremental = true;
            PlayerSettings.colorSpace = ColorSpace.Linear;

            PlayerSettings.SetScriptingBackend(NamedBuildTarget.Android, ScriptingImplementation.IL2CPP);
            PlayerSettings.SetManagedStrippingLevel(NamedBuildTarget.Android, ManagedStrippingLevel.Medium);
            PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64;
            PlayerSettings.Android.minSdkVersion = (AndroidSdkVersions)MinimumAndroidApiLevel;
            PlayerSettings.Android.targetSdkVersion = AndroidSdkVersions.AndroidApiLevelAuto;
            PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.Android, false);
            PlayerSettings.SetGraphicsAPIs(BuildTarget.Android, new[] { GraphicsDeviceType.Vulkan, GraphicsDeviceType.OpenGLES3 });

            PlayerSettings.SetScriptingBackend(NamedBuildTarget.iOS, ScriptingImplementation.IL2CPP);
            PlayerSettings.SetManagedStrippingLevel(NamedBuildTarget.iOS, ManagedStrippingLevel.Medium);

            SetActiveInputHandlerToInputSystem();
        }

        /// <summary>
        /// "Active Input Handling" has no public scripting API; set the serialized PlayerSettings field.
        /// Takes effect after an editor restart.
        /// </summary>
        private static void SetActiveInputHandlerToInputSystem()
        {
            Object playerSettings = Unsupported.GetSerializedAssetInterfaceSingleton("PlayerSettings");
            var serialized = new SerializedObject(playerSettings);
            SerializedProperty property = serialized.FindProperty("activeInputHandler");
            if (property != null && property.intValue != InputSystemOnly)
            {
                property.intValue = InputSystemOnly;
                serialized.ApplyModifiedProperties();
                Debug.LogWarning("Active input handling switched to the Input System package. Restart the editor.");
            }
        }

        private static void EnsureFolder(string parent, string name)
        {
            if (!AssetDatabase.IsValidFolder(parent + "/" + name))
            {
                AssetDatabase.CreateFolder(parent, name);
            }
        }
    }
}
