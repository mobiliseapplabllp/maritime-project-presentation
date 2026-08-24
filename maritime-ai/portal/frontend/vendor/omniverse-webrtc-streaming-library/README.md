
This package provides functionality to allow managing Omniverse Kit applications streaming from GFN, on a local machine, or from some container instance with a provided URL.

## Usage

AppStreamer is the main entry point into this library. It can be used connect to, pause, un-pause, and terminate a streaming Omniverse kit application session. It can also be used to send/recieve custom messages to/from the streaming kit application. Application can be streaming from GFN, NVCF, OVC, and a locally running kit application.

### Scoping NPM

The correct scope must be defined in your .npmrc file before installing.

```
    @omniverse:registry=https://edge.urm.nvidia.com/artifactory/api/npm/omniverse-npm/
```

### Installation

```
    npm install @nvidia/omniverse-webrtc-streaming-library
```

### Importing

```
    import { AppStreamer } from '@nvidia/omniverse-webrtc-streaming-library'
```

#### GFN

If connecting to an application running on GFN, you must import GFN separately. The recommended method to import GFN into a project is by sourcing the CDN in the project index.html file, as shown below:

```
    <!DOCTYPE html>
    <html lang="en">
        <body>
            <script src="https://sdk.nvidia.com/gfn/client-sdk/1.x/gfn-client-sdk.js"></script>
        </body>
    </html>
```

## Examples

### Connecting

#### Configuration

##### Direct

Configuration for a Kit application running in a directly-accessible container: either local or in a remote:

```
    // This example server is localhost, but can be a valid remote IP as well.

    const streamParams: DirectConfig = {
        streamSource : StreamType.DIRECT,
        logLevel     : LogLevel.WARN,
        streamConfig : {
            server        : '<some ip address>',
            width         : 1920,
            height        : 1028,
            fps           : 60,
            onStart       : (message: StreamEvent) => {console.info('Stream started')},
            onStop        : (message: StreamEvent) => {console.info('Stream stopped')},
            onStreamStats : (message: StreamEvent) => {console.info('Stream stats')}
        }
    };
```

##### NVCF

Configuration for a Kit application running on NVCF:

```
    // This example server is localhost, but can be a valid remote IP as well.

    const streamParams: NVCFConfig = {
        streamSource : StreamType.NVCF,
        logLevel     : LogLevel.WARN,
        streamConfig : {
            signalingPort   : <some port number>
            signalingServer : '<some URL>',
            signalingPath   : '<some path>'
            signalingQuery  : ''<some query>'
            width           : 1920,
            height          : 1028,
            fps             : 60,
            onStart         : (message: StreamEvent) => {console.info('Stream started')},
            onStop          : (message: StreamEvent) => {console.info('Stream stopped')},
            onStreamStats   : (message: StreamEvent) => {console.info('Stream stats')}
        }
    };
```

##### GFN

Configuration for a Kit app running on GFN:

```
    const streamParams: GFNConfig = {
        streamSource : StreamType.GFN,
        logLevel     : LogLevel.WARN,
        streamConfig : {
            // GFN will be resolved by the script source discussed above.
            GFN             : GFN,
            catalogClientId : <your value>,
            clientId        : <your value>,
            cmsId           : <your value>,
            onStart         : (message: StreamEvent) => {console.info('Stream started')},
            onStop          : (message: StreamEvent) => {console.info('Stream stopped')},
            onStreamStats   : (message: StreamEvent) => {console.info('Stream stats')}
        }
    };
```

#### Connecting

Using the streamParams config:

```
    AppStreamer.connect(streamParams)
        .then((result: StreamEvent) => {
            // The connection request was successful. The onStart  
            // callback will fire when the stream is ready.
            console.info(result);
        })
        .catch((error: StreamEvent) => {
            // The connection request has failed.
            console.error(error);
        });
```

### Disconnecting

```
    AppStreamer.terminate()
        .then((result: StreamEvent) => {
            // Request has been made successfully. The onStop
            // callback will fire when termination is complete.
            console.info(result));
        })
        .catch((error: StreamEvent) => {
            // The terminate request has failed.
            console.error(error));
        });
```

## Callbacks

None of the callbacks are required, but there are a few that are very helpful.

### onStart

Define your onStart callback passed with the streamParams to determine success of the connection request.

```
    onStart(message: StreamEvent) : void {
        if ( message.status === eStatus.success ) {
            // The stream is connected and ready.
            console.info('onStart:', message));
        }
        else if ( message.status === eStatus.warning ) {
            // There may be an issue with the stream connection.
            console.warn('onStart:', message));
        }
        else if ( message.status === eStatus.error ) {
            // The connection has failed.
            console.info('onStart:', message));
        }
    }
```

### onStop

Define your onStop callback message to determine unexpected and successfull stream disconnections.

```
    onStop(message: StreamEvent) : void {
        if ( message.action === eAction.terminate &&
             message.status === eStatus.error ) {
            // The connected stream has been disconnected unexpectedly.
            console.error('onStop:', message));
        }
        else if ( message.action === eAction.terminate &&
                  message.status === eStatus.success ) {
            // A request to disconnect the stream was successfull -
            // the stream has been disconnected.
            console.info('onStop:', message));
        }
    }
```

### onStreamStats

The onStreamStats callback, if passed, will be called at regular intervals to provide information and performance metrics about the connected stream.

```
    onStreamStats(message: StreamEvent) : void {
        console.info('Stream stats:', message.stats);
    }
```
