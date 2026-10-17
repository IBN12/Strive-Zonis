export function errorHandler(err, req, res, next){
    console.error('💥', err); 

    // Never leak stack traces or SQL to the client:
    const status = err.status || 500;
    const message = status === 500 ? 'Something went wrong' : err.message;

    res.status(status).json({ error: message }); 
}

export function notFound(req, res){
    res.status(404).json({ error: 'Not found' });
}