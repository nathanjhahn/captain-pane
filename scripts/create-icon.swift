// macOS-only build helper: swift scripts/create-icon.swift
import AppKit
import Foundation

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let directory = root.appendingPathComponent("artifacts/CaptainPane.iconset")
try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

func image(_ size: Int) -> Data {
    let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    let context = NSGraphicsContext(bitmapImageRep: bitmap)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = context
    context.cgContext.scaleBy(x: CGFloat(size) / 1024, y: CGFloat(size) / 1024)
    let background = NSBezierPath(roundedRect: NSRect(x: 60, y: 60, width: 904, height: 904), xRadius: 205, yRadius: 205)
    NSColor(srgbRed: 0.075, green: 0.13, blue: 0.16, alpha: 1).setFill()
    background.fill()
    NSColor(srgbRed: 0.20, green: 0.32, blue: 0.33, alpha: 1).setStroke()
    background.lineWidth = 8
    background.stroke()
    let ring = NSBezierPath(ovalIn: NSRect(x: 206, y: 206, width: 612, height: 612))
    ring.lineWidth = 7
    ring.stroke()
    let compass = NSBezierPath()
    compass.move(to: NSPoint(x: 702, y: 730))
    compass.line(to: NSPoint(x: 568, y: 437))
    compass.line(to: NSPoint(x: 300, y: 294))
    compass.line(to: NSPoint(x: 437, y: 582))
    compass.close()
    NSColor(srgbRed: 0.66, green: 0.90, blue: 0.76, alpha: 1).setFill()
    compass.fill()
    NSColor(srgbRed: 0.075, green: 0.13, blue: 0.16, alpha: 1).setFill()
    NSBezierPath(ovalIn: NSRect(x: 469, y: 469, width: 86, height: 86)).fill()
    NSGraphicsContext.restoreGraphicsState()
    return bitmap.representation(using: .png, properties: [:])!
}

for size in [16, 32, 128, 256, 512] {
    try image(size).write(to: directory.appendingPathComponent("icon_\(size)x\(size).png"))
    try image(size * 2).write(to: directory.appendingPathComponent("icon_\(size)x\(size)@2x.png"))
}
let process = Process()
process.executableURL = URL(fileURLWithPath: "/usr/bin/iconutil")
process.arguments = ["-c", "icns", directory.path, "-o", root.appendingPathComponent("desktop/icon.icns").path]
try process.run()
process.waitUntilExit()
if process.terminationStatus != 0 { exit(process.terminationStatus) }
print("Created desktop/icon.icns")
