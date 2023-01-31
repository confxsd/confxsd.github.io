



const getTracks = (data) => {
    return data.items.map(i => {
        return {
            title: i.track.name,
            url: i.track.href
        }
    }).slice(0, 10)
}


document.addEventListener('DOMContentLoaded', async () => {
    // const data = await fetch('https://api.spotify.com/v1/playlists/4t0bBZ7kShPlSfUl1XvPvu/tracks?fields=items(added_by.id%20%2Ctrack(name%2Cexternal_urls(spotify)%2Calbum(name%2Chref)))', {
    //     headers: {
    //         'Accept': 'application/json',
    //         'Content-Type': 'application/json',
    //         'Authorization': 'Bearer BQAxShot4iWo4lD3i1w9_ewkqJemaWWofk9f4g4yfX4Q6g8eP1dONVC9l5eqqp8kapN6UMLBzd4ppB8wuAV8EXUBGGWrL-GMOqNOn96XYYhucCVsktmuE22M21ZQe15w5r3ez0jlB37_t4xvpumx2z-KKtO9riEjrZtB_pNgEQ'
    //     }
    // });

    const data = fetch({
        method: 'post',
        url: 'https://accounts.spotify.com/login/password',
        origin: 'https://accounts.spotify.com/login/password',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        },
        body: {
            username: '',
            password: ''
        }
    })

    console.log(data)
})