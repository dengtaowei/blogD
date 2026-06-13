#!/bin/sh
set -e

G=/sys/kernel/config/usb_gadget/deferred_fb_serial
UDC=$(ls /sys/class/udc | head -n 1)

create() {
    modprobe libcomposite
    mkdir -p "$G"
    cd "$G"

    echo 0x1d6b > idVendor
    echo 0x0104 > idProduct
    echo 0x0100 > bcdDevice
    echo 0x0200 > bcdUSB

    mkdir -p strings/0x409
    echo "DEMO0002" > strings/0x409/serialnumber
    echo "DemoVendor" > strings/0x409/manufacturer
    echo "DeferredFB Serial" > strings/0x409/product

    mkdir -p configs/c.1/strings/0x409
    echo "CDC ACM Config" > configs/c.1/strings/0x409/configuration
    echo 250 > configs/c.1/MaxPower

    mkdir -p functions/acm.0
    ln -sf functions/acm.0 configs/c.1/acm.0

    echo "$UDC" > UDC
    echo "Serial gadget enabled on $UDC"
}

destroy() {
    if [ ! -d "$G" ]; then
        echo "not created"
        return
    fi

    cd "$G"
    echo "" > UDC || true
    rm -f configs/c.1/acm.0
    rmdir functions/acm.0 || true
    rmdir configs/c.1/strings/0x409 || true
    rmdir configs/c.1 || true
    rmdir strings/0x409 || true
    cd /
    rmdir "$G" || true
    echo "Serial gadget disabled"
}

case "${1:-up}" in
    up) create ;;
    down) destroy ;;
    *) echo "usage: $0 [up|down]"; exit 1 ;;
esac
