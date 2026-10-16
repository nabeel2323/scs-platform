allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
    // Force Flutter plugins to compile against SDK 36. This must be registered here,
    // BEFORE evaluationDependsOn(":app") below force-evaluates :app; otherwise
    // afterEvaluate throws "Cannot run Project.afterEvaluate when the project is already evaluated".
    // Some plugins (e.g. file_picker) hardcode compileSdk 34, but their transitive dep
    // flutter_plugin_android_lifecycle requires consumers to compile against 36+.
    afterEvaluate {
        val androidExt = project.extensions.findByName("android") ?: return@afterEvaluate
        androidExt.javaClass.methods
            .firstOrNull { it.name == "setCompileSdk" && it.parameterCount == 1 }
            ?.invoke(androidExt, 36)
    }
}
subprojects {
    project.evaluationDependsOn(":app")
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
