# JNA (used by the generated UniFFI bindings) reflects on its own classes and on the generated
# Structure/Callback subclasses. Needed as soon as an app enables R8.
-dontwarn java.awt.*
-keep class com.sun.jna.* { *; }
-keepclassmembers class * extends com.sun.jna.* { public *; }
-keep class uniffi.kinetic.** { *; }
