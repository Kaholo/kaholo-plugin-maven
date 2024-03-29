const { docker } = require("@kaholo/plugin-library");
const {
  join: joinPaths,
  resolve: resolvePath,
} = require("path");
const { homedir: getHomeDirectory } = require("os");
const {
  assertPathExistence,
  asyncExec,
} = require("./helpers");
const {
  MAVEN_DOCKER_IMAGE,
  MAVEN_CLI_NAME,
  MAVEN_CACHE_DIRECTORY_NAME,
} = require("./consts.json");

async function execute(params) {
  const {
    command,
    workingDirectory,
    environmentVariables,
    secretEnvVars,
    customImage = MAVEN_DOCKER_IMAGE,
    colorOutput,
  } = params;

  let colorCommand = command;
  if (colorOutput && !command.includes("style.color")) {
    colorCommand = `${command} -Dstyle.color=always`;
  }

  const dockerCommandBuildOptions = {
    command: docker.sanitizeCommand(colorCommand, MAVEN_CLI_NAME),
    image: customImage,
  };

  const mavenAgentCachePath = joinPaths(getHomeDirectory(), MAVEN_CACHE_DIRECTORY_NAME);
  const mavenCacheVolumeDefinition = docker.createVolumeDefinition(mavenAgentCachePath);
  // Change mount point to maven cache path
  mavenCacheVolumeDefinition.mountPoint.value = joinPaths("/root", MAVEN_CACHE_DIRECTORY_NAME);

  const dockerEnvironmentalVariables = {
    [mavenCacheVolumeDefinition.mountPoint.name]: mavenCacheVolumeDefinition.mountPoint.value,
    ...environmentVariables,
    ...secretEnvVars,
  };
  let shellEnvironmentalVariables = {
    ...dockerEnvironmentalVariables,
    [mavenCacheVolumeDefinition.path.name]: mavenCacheVolumeDefinition.path.value,
  };

  const volumeDefinitionsArray = [mavenCacheVolumeDefinition];

  const absoluteWorkingDirectory = workingDirectory ? resolvePath(workingDirectory) : process.cwd();

  await assertPathExistence(absoluteWorkingDirectory);
  const workingDirVolumeDefinition = docker.createVolumeDefinition(absoluteWorkingDirectory);

  dockerEnvironmentalVariables[workingDirVolumeDefinition.mountPoint.name] = (
    workingDirVolumeDefinition.mountPoint.value
  );

  shellEnvironmentalVariables = {
    ...shellEnvironmentalVariables,
    ...dockerEnvironmentalVariables,
    [workingDirVolumeDefinition.path.name]: workingDirVolumeDefinition.path.value,
  };

  volumeDefinitionsArray.push(workingDirVolumeDefinition);
  dockerCommandBuildOptions.workingDirectory = workingDirVolumeDefinition.mountPoint.value;

  dockerCommandBuildOptions.volumeDefinitionsArray = volumeDefinitionsArray;
  dockerCommandBuildOptions.environmentVariables = dockerEnvironmentalVariables;

  const dockerCommand = docker.buildDockerCommand(dockerCommandBuildOptions);

  return asyncExec({
    command: dockerCommand,
    options: {
      env: shellEnvironmentalVariables,
    },
    onProgressFn: process.stdout.write.bind(process.stdout),
  }).catch((error) => {
    throw new Error(error.stderr || error.stdout || error.message || error);
  });
}

module.exports = {
  execute,
};
