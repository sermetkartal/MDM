plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.kapt)
    alias(libs.plugins.hilt)
}

android {
    namespace = "com.mdm.agent"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.mdm.agent"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation(project(":core:core-common"))
    implementation(project(":core:core-network"))
    implementation(project(":core:core-database"))
    implementation(project(":core:core-security"))
    implementation(project(":feature:feature-enrollment"))
    implementation(project(":feature:feature-kiosk"))
    implementation(project(":feature:feature-policy"))
    implementation(project(":feature:feature-remote-control"))
    implementation(project(":feature:feature-monitoring"))
    implementation(project(":feature:feature-location"))
    implementation(project(":feature:feature-appmanagement"))
    implementation(project(":service:service-agent"))
    implementation(project(":service:service-communication"))
    implementation(project(":dpc"))

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.activity.ktx)
    implementation(libs.lifecycle.runtime.ktx)
    implementation(libs.lifecycle.process)
    implementation(libs.hilt.android)
    kapt(libs.hilt.compiler)
    implementation(libs.timber)
    implementation(libs.work.runtime.ktx)
}

kapt {
    correctErrorTypes = true
}
