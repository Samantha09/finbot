#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$PROJECT_ROOT/dist/finbot-installer"
OUTPUT_TAR="$PROJECT_ROOT/dist/finbot-installer-x86_64.tar.gz"

echo "========================================"
echo "  FinBot Installer Builder"
echo "========================================"
echo ""

# Clean and create build directory
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/plugins"
mkdir -p "$BUILD_DIR/skills"

echo "Building plugins..."
for plugin in market audit guard rate-limit; do
  PLUGIN_DIR="$PROJECT_ROOT/plugins/finbot-$plugin"
  echo "  Building finbot-$plugin..."
  cd "$PLUGIN_DIR"
  npm install
  npm run build
  npm run test:ci

  echo "  Copying finbot-$plugin dist..."
  mkdir -p "$BUILD_DIR/plugins/finbot-$plugin"
  cp -r "$PLUGIN_DIR/dist" "$BUILD_DIR/plugins/finbot-$plugin/"
  cp "$PLUGIN_DIR/package.json" "$BUILD_DIR/plugins/finbot-$plugin/"
  cp "$PLUGIN_DIR/openclaw.plugin.json" "$BUILD_DIR/plugins/finbot-$plugin/"
done

echo ""
echo "Copying skills..."
cp -r "$PROJECT_ROOT/skills/"* "$BUILD_DIR/skills/"

echo "Copying installer scripts..."
cp "$SCRIPT_DIR/installer/install.sh" "$BUILD_DIR/"
cp "$SCRIPT_DIR/installer/merge-config" "$BUILD_DIR/merge-config.js"
cp "$SCRIPT_DIR/installer/finbot.env" "$BUILD_DIR/"
cp "$SCRIPT_DIR/installer/README.md" "$BUILD_DIR/"

echo "Copying OpenClaw config template..."
cp "$PROJECT_ROOT/openclaw.json" "$BUILD_DIR/"

echo ""
echo "Creating tarball..."
rm -f "$OUTPUT_TAR"
cd "$PROJECT_ROOT/dist"
tar -czf finbot-installer-x86_64.tar.gz finbot-installer

echo ""
echo "========================================"
echo "  Build complete!"
echo "========================================"
echo ""
echo "Output: $OUTPUT_TAR"
echo "Size: $(du -h "$OUTPUT_TAR" | cut -f1)"
echo ""
echo "To test in Docker:"
echo "  cd scripts/installer/test && docker build -t finbot-installer-test ."
