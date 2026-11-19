const { withGradleProperties, withProjectBuildGradle, createRunOncePlugin } = require('@expo/config-plugins');

function withIpv4Gradle(config) {
  config = withGradleProperties(config, (config) => {
    const setProp = (key, value) => {
      const existing = config.modResults.find((p) => p.type === 'property' && p.key === key);
      if (existing) {
        existing.value = value;
      } else {
        config.modResults.push({ type: 'property', key, value });
      }
    };

    setProp('systemProp.java.net.preferIPv4Stack', 'true');
    setProp('systemProp.java.net.preferIPv4Addresses', 'true');
    setProp(
      'org.gradle.jvmargs',
      '-Xmx2048m -XX:MaxMetaspaceSize=512m -Djava.net.preferIPv4Stack=true -Djava.net.preferIPv4Addresses=true'
    );

    return config;
  });

  config = withProjectBuildGradle(config, (config) => {
    if (!config.modResults.contents.includes('createNativeDepsDirectories')) {
      config.modResults.contents += `
subprojects { subproject ->
  def localZip = new File(rootDir, "../downloads/sqlite-amalgamation-3450300.zip")
  if (localZip.exists()) {
    subproject.tasks.matching { it.name == 'createNativeDepsDirectories' }.configureEach {
      doLast {
        def downloadTask = subproject.tasks.findByName('downloadSQLite')
        if (downloadTask != null && downloadTask.dest != null) {
          def destFile = (downloadTask.dest instanceof File) ? downloadTask.dest : new File(downloadTask.dest.toString())
          destFile.parentFile.mkdirs()
          java.nio.file.Files.copy(localZip.toPath(), destFile.toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING)
        }
      }
    }
    subproject.tasks.matching { it.name == 'downloadSQLite' }.configureEach {
      onlyIf { false }
    }
  }
}
`;
    }
    return config;
  });

  return config;
}

module.exports = createRunOncePlugin(withIpv4Gradle, 'with-ipv4-gradle', '1.0.0');
