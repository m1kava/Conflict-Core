using System;
using System.Collections.Generic;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace ConflictCore.Client.Editor
{
    /// <summary>
    /// Command-line build entry points used by CI (game-ci/unity-builder <c>buildMethod</c>) and locally.
    /// Accepts game-ci's argument names, so the same method works in both places:
    /// <c>-customBuildPath</c>, <c>-buildVersion</c>, <c>-androidVersionCode</c>, <c>-androidExportType</c>
    /// (androidPackage | androidAppBundle), <c>-androidKeystoreName</c>, <c>-androidKeystorePass</c>,
    /// <c>-androidKeyaliasName</c>, <c>-androidKeyaliasPass</c>, plus <c>-developmentBuild</c>.
    /// Signing secrets arrive only through CI secrets, never from the repository.
    /// </summary>
    public static class BuildScript
    {
        private const int ExitSuccess = 0;
        private const int ExitFailure = 1;

        public static void BuildAndroid()
        {
            Dictionary<string, string> args = ParseArguments(Environment.GetCommandLineArgs());
            int exitCode = ExitFailure;
            try
            {
                exitCode = RunAndroidBuild(args) ? ExitSuccess : ExitFailure;
            }
            catch (Exception exception)
            {
                Debug.LogException(exception);
            }

            if (Application.isBatchMode)
            {
                EditorApplication.Exit(exitCode);
            }
        }

        private static bool RunAndroidBuild(Dictionary<string, string> args)
        {
            ProjectSetup.Apply();

            bool appBundle = Get(args, "androidExportType", "androidPackage") == "androidAppBundle";
            bool development = args.ContainsKey("developmentBuild");
            string output = Get(args, "customBuildPath", appBundle ? "Builds/Android/ConflictCore.aab" : "Builds/Android/ConflictCore.apk");

            PlayerSettings.bundleVersion = Get(args, "buildVersion", PlayerSettings.bundleVersion);
            if (int.TryParse(Get(args, "androidVersionCode", string.Empty), out int versionCode))
            {
                PlayerSettings.Android.bundleVersionCode = versionCode;
            }

            if (!ConfigureSigning(args, requireReleaseKey: appBundle && !development))
            {
                return false;
            }

            EditorUserBuildSettings.buildAppBundle = appBundle;
            var options = new BuildPlayerOptions
            {
                scenes = new[] { ProjectSetup.BootstrapScenePath },
                locationPathName = output,
                target = BuildTarget.Android,
                options = development ? BuildOptions.Development | BuildOptions.ConnectWithProfiler : BuildOptions.None,
            };

            BuildReport report = BuildPipeline.BuildPlayer(options);
            BuildSummary summary = report.summary;
            Debug.Log($"Android build {summary.result}: {summary.outputPath}, {summary.totalSize / (1024 * 1024)} MB, " +
                $"{summary.totalErrors} errors, {summary.totalWarnings} warnings, {summary.totalTime}.");
            return summary.result == BuildResult.Succeeded;
        }

        private static bool ConfigureSigning(Dictionary<string, string> args, bool requireReleaseKey)
        {
            string keystore = Get(args, "androidKeystoreName", string.Empty);
            if (string.IsNullOrEmpty(keystore))
            {
                if (requireReleaseKey)
                {
                    Debug.LogError("Release app bundles must be signed: provide -androidKeystoreName and passwords via CI secrets.");
                    return false;
                }

                PlayerSettings.Android.useCustomKeystore = false;
                Debug.Log("No keystore supplied: using the Unity debug key (development/testing builds only).");
                return true;
            }

            PlayerSettings.Android.useCustomKeystore = true;
            PlayerSettings.Android.keystoreName = keystore;
            PlayerSettings.Android.keystorePass = Get(args, "androidKeystorePass", string.Empty);
            PlayerSettings.Android.keyaliasName = Get(args, "androidKeyaliasName", string.Empty);
            PlayerSettings.Android.keyaliasPass = Get(args, "androidKeyaliasPass", string.Empty);
            return true;
        }

        private static Dictionary<string, string> ParseArguments(string[] commandLine)
        {
            var result = new Dictionary<string, string>(StringComparer.Ordinal);
            for (int i = 0; i < commandLine.Length; i++)
            {
                if (!commandLine[i].StartsWith("-", StringComparison.Ordinal))
                {
                    continue;
                }

                string key = commandLine[i].Substring(1);
                bool hasValue = i + 1 < commandLine.Length && !commandLine[i + 1].StartsWith("-", StringComparison.Ordinal);
                result[key] = hasValue ? commandLine[++i] : string.Empty;
            }

            return result;
        }

        private static string Get(Dictionary<string, string> args, string key, string fallback) =>
            args.TryGetValue(key, out string? value) && !string.IsNullOrEmpty(value) ? value : fallback;
    }
}
