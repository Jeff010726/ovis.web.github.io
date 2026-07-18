# Device network reset API

The configuration dashboard resets an initialized device through:

```http
POST /api/v1/device/network/reset
```

The request has no body, authentication data, custom headers, or cached response.
Any `2xx` response means the reset has been accepted. The Manager must send that
response before restarting so the browser can distinguish an accepted reset from
a transport failure.

After acknowledging the request, the board-side handler performs:

```sh
rm -f /mnt/cfg/ovis-manager/ncm-subnet
rm -f /mnt/cfg/ovis-manager/ncm-subnet.pending
sync
reboot
```

The reboot should be scheduled after the HTTP response has been flushed. Once the
request succeeds, the web app forgets the previous device-to-subnet assignment,
removes the stale network result, and waits for the device to return as an
uninitialized WebUSB device.
