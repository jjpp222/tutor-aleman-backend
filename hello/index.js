module.exports = function (context, req) {
    context.res = {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        body: {
            message: "Hello World",
            status: "ok"
        }
    };
    context.done();
};