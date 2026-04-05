pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolution {
    @Suppress("UnstableApiUsage")
    repositories {
        google()
        mavenCentral()
        maven("https://repo.eclipse.org/content/repositories/paho-releases/")
    }
}

rootProject.name = "mdm-agent"

include(":app")
include(":core:core-common")
include(":core:core-network")
include(":core:core-database")
include(":core:core-security")
include(":feature:feature-enrollment")
include(":feature:feature-kiosk")
include(":feature:feature-policy")
include(":feature:feature-remote-control")
include(":feature:feature-monitoring")
include(":feature:feature-location")
include(":feature:feature-appmanagement")
include(":service:service-agent")
include(":service:service-communication")
include(":dpc")
