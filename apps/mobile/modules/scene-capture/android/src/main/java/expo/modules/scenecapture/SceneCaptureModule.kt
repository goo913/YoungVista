package expo.modules.scenecapture

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.net.Uri
import android.view.TextureView
import android.view.View
import android.view.ViewGroup
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.util.UUID

/**
 * Captures YoungVista's 3D view as a JPEG (see modules/scene-capture/index.ts). ViroReact draws the
 * 3D view into a TextureView (ViroCore's GLTextureView); `TextureView.getBitmap()` is its latest
 * frame.
 */
class SceneCaptureModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SceneCapture")

    AsyncFunction("captureAsync") Coroutine { viewTag: Int, options: CaptureOptions ->
      val frame = withContext(Dispatchers.Main) {
        val root = appContext.findView<View>(viewTag) ?: throw SceneViewNotFoundException()
        val texture = firstTextureView(root) ?: throw NoSceneRendererException()
        if (!texture.isAvailable || texture.width <= 0 || texture.height <= 0) {
          throw NoSceneRendererException()
        }
        texture.bitmap ?: throw CaptureFailedException()
      }
      withContext(Dispatchers.IO) {
        writeJpeg(frame, options, File(appContext.cacheDirectory, "scene-capture"))
      }
    }
  }
}

class CaptureOptions : Record {
  @Field
  var quality: Double = 0.92

  @Field
  var background: String = "#ffffff"
}

internal class SceneViewNotFoundException : CodedException("The 3D view is not on screen")

internal class NoSceneRendererException : CodedException("The 3D view has not started drawing yet")

internal class CaptureFailedException : CodedException("The 3D view could not be captured")

/** The renderer's view: ViroCore's GLTextureView, somewhere under the navigator's view. */
private fun firstTextureView(view: View): TextureView? {
  if (view is TextureView) return view
  if (view is ViewGroup) {
    for (i in 0 until view.childCount) {
      firstTextureView(view.getChildAt(i))?.let { return it }
    }
  }
  return null
}

/** The frame, flattened onto an opaque background at its full pixel size, as a JPEG. */
private fun writeJpeg(frame: Bitmap, options: CaptureOptions, directory: File): Map<String, Any> {
  val flat = Bitmap.createBitmap(frame.width, frame.height, Bitmap.Config.ARGB_8888)
  Canvas(flat).apply {
    drawColor(parseColor(options.background))
    drawBitmap(frame, 0f, 0f, null)
  }
  frame.recycle()
  try {
    if (!directory.exists() && !directory.mkdirs()) throw CaptureFailedException()
    val file = File(directory, "${UUID.randomUUID()}.jpg")
    val quality = (options.quality.coerceIn(0.1, 1.0) * 100).toInt()
    FileOutputStream(file).use { out ->
      if (!flat.compress(Bitmap.CompressFormat.JPEG, quality, out)) throw CaptureFailedException()
    }
    return mapOf("uri" to Uri.fromFile(file).toString(), "width" to flat.width, "height" to flat.height)
  } finally {
    flat.recycle()
  }
}

private fun parseColor(hex: String): Int =
  try {
    Color.parseColor(hex)
  } catch (e: IllegalArgumentException) {
    Color.WHITE
  }
